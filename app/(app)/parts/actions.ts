'use server'

/**
 * Every parts write in the app goes through one of these.
 *
 * The interesting one is removal. docs/01-PRODUCT.md, section F: "Removing a
 * part from the car prompts: keep, sell, or bin. Selling records a negative
 * expense so the true cost of a mod nets out correctly."
 *
 * The negative expense is built here, on the server, rather than sent by the
 * browser — its sign, its bucket, its vehicle and the mod it points at are all
 * decided by what is being sold, not by what a payload claims. A sale that
 * arrived as a positive number would silently double a mod's cost instead of
 * halving it.
 */

import { revalidatePath } from 'next/cache'

import { createClient } from '@/lib/supabase/server'
import { syncAttachments } from '@/lib/attachments/server'
import {
  partCreateSchema,
  partIdSchema,
  partRemovalSchema,
  partWriteSchema,
  type PartWrite,
} from '@/lib/parts/schema'
import type { ExpenseWrite } from '@/lib/expenses/schema'
import type { ActionResult } from '@/app/(app)/expenses/actions'

function revalidatePartsScreens(withExpense = false): void {
  revalidatePath('/garage', 'layout')
  if (withExpense) {
    revalidatePath('/today')
    revalidatePath('/ledger')
    revalidatePath('/money')
  }
}

async function currentUserId(): Promise<string | null> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  return user?.id ?? null
}

function firstIssue(error: unknown): string {
  if (error && typeof error === 'object' && 'issues' in error) {
    const issues = (error as { issues: { message: string }[] }).issues
    return issues[0]?.message ?? 'That part is not valid'
  }
  return 'That part is not valid'
}

function partRow(input: PartWrite, userId: string) {
  return {
    id: input.id,
    user_id: userId,
    vehicle_id: input.vehicle_id,
    name: input.name,
    brand: input.brand,
    part_number: input.part_number,
    status: input.status,
    installed_on: input.installed_on,
    removed_on: input.removed_on,
    warranty_until: input.warranty_until,
    expense_id: input.expense_id,
    mod_plan_id: input.mod_plan_id,
    notes: input.notes,
  }
}

function expenseRow(input: ExpenseWrite, userId: string) {
  return {
    id: input.id,
    user_id: userId,
    occurred_on: input.occurred_on,
    amount: input.amount,
    currency: input.currency,
    category_id: input.category_id,
    vehicle_id: input.vehicle_id,
    bucket: input.bucket,
    counts_toward_budget: input.counts_toward_budget,
    amortize_months: input.amortize_months,
    merchant: input.merchant,
    note: input.note,
    odometer_km: input.odometer_km,
    ...(input.mod_plan_id === undefined ? {} : { mod_plan_id: input.mod_plan_id }),
  }
}

/**
 * A part, from scratch or from an expense already in the ledger.
 *
 * "From an expense" sets `expense_id` and nothing else changes; "from scratch"
 * may carry a new expense with it, which is written first for the same reason
 * the service flow writes its expense first.
 */
export async function createPartAction(
  raw: unknown,
  rawAttachments: unknown = [],
): Promise<ActionResult> {
  const parsed = partCreateSchema.safeParse(raw)
  if (!parsed.success) return { ok: false, error: firstIssue(parsed.error) }

  const userId = await currentUserId()
  if (!userId) return { ok: false, error: 'Sign in again to save this' }

  const supabase = await createClient()
  const { part, expense } = parsed.data

  let expenseId = part.expense_id
  if (expense) {
    const { error } = await supabase.from('expenses').insert(expenseRow(expense, userId))
    if (error) return { ok: false, error: error.message }
    expenseId = expense.id
  }

  const { error } = await supabase
    .from('parts')
    .insert({ ...partRow(part, userId), expense_id: expenseId })

  if (error) {
    if (expense) await supabase.from('expenses').delete().eq('id', expense.id)
    return { ok: false, error: error.message }
  }

  const photoError = await syncAttachments('part', part.id, userId, rawAttachments)
  if (photoError) return { ok: false, error: photoError }

  revalidatePartsScreens(expense !== null)
  return { ok: true }
}

export async function updatePartAction(
  raw: unknown,
  rawAttachments: unknown = [],
): Promise<ActionResult> {
  const parsed = partWriteSchema.safeParse(raw)
  if (!parsed.success) return { ok: false, error: firstIssue(parsed.error) }

  const userId = await currentUserId()
  if (!userId) return { ok: false, error: 'Sign in again to save this' }

  const supabase = await createClient()
  const { user_id: _userId, id, ...columns } = partRow(parsed.data, userId)
  const { error } = await supabase.from('parts').update(columns).eq('id', id)
  if (error) return { ok: false, error: error.message }

  const photoError = await syncAttachments('part', id, userId, rawAttachments)
  if (photoError) return { ok: false, error: photoError }

  revalidatePartsScreens()
  return { ok: true }
}

/**
 * Take a part off the car: keep it, sell it, or bin it.
 *
 * Selling writes one expense with a negative amount, in the same bucket and
 * against the same mod as the purchase. That is what makes a mod's net cost
 * right: the actual on a mod card is the sum of every expense pointing at it,
 * so money coming back is simply an expense with a minus in front of it and no
 * other part of the app has to know that a sale is a special kind of thing.
 *
 * The bucket and the category are copied from the purchase where there is one,
 * because a sale belongs in the same pile of money the buy came out of. With no
 * purchase to copy from it lands as project spend, out of the monthly view, on
 * the same policy as anything else discretionary about the car.
 */
export async function removePartAction(raw: unknown): Promise<ActionResult> {
  const parsed = partRemovalSchema.safeParse(raw)
  if (!parsed.success) return { ok: false, error: firstIssue(parsed.error) }

  const userId = await currentUserId()
  if (!userId) return { ok: false, error: 'Sign in again to save this' }

  const supabase = await createClient()
  const { id, outcome, removed_on, sale_amount, sale_note } = parsed.data

  const { data: part, error: read } = await supabase
    .from('parts')
    // `parts` has two foreign keys into `expenses` — the purchase and the sale —
    // so the embed has to name which one, or PostgREST refuses the whole select
    // as ambiguous and the removal silently does nothing.
    .select(
      'id, name, vehicle_id, mod_plan_id, sale_expense_id, ' +
        'purchase:expenses!parts_expense_id_fkey(category_id, bucket, counts_toward_budget, currency)',
    )
    .eq('id', id)
    .maybeSingle()

  if (read) return { ok: false, error: read.message }
  if (!part) return { ok: false, error: 'Unknown part' }

  type Linked = { category_id: string | null; bucket: ExpenseWrite['bucket']; counts_toward_budget: boolean; currency: string }
  const row = part as unknown as {
    name: string
    vehicle_id: string
    mod_plan_id: string | null
    sale_expense_id: string | null
    purchase: Linked | Linked[] | null
  }

  const purchase = Array.isArray(row.purchase) ? (row.purchase[0] ?? null) : row.purchase

  let saleExpenseId: string | null = row.sale_expense_id
  if (outcome === 'sold' && sale_amount !== null && sale_amount > 0) {
    const { data: profile } = await supabase.from('profiles').select('base_currency').maybeSingle()
    saleExpenseId = crypto.randomUUID()

    const { error } = await supabase.from('expenses').insert({
      id: saleExpenseId,
      user_id: userId,
      occurred_on: removed_on,
      // The minus is the whole mechanism. Money came back.
      amount: -sale_amount,
      currency: purchase?.currency ?? profile?.base_currency ?? 'VND',
      category_id: purchase?.category_id ?? null,
      vehicle_id: row.vehicle_id,
      bucket: purchase?.bucket ?? 'car_project',
      counts_toward_budget: purchase?.counts_toward_budget ?? false,
      amortize_months: 1,
      merchant: sale_note,
      note: `Sold: ${row.name}`,
      // Against the same mod, so the mod's net cost comes out right.
      ...(row.mod_plan_id ? { mod_plan_id: row.mod_plan_id } : {}),
    })

    if (error) return { ok: false, error: error.message }
  }

  const { error } = await supabase
    .from('parts')
    .update({
      status: outcome,
      removed_on,
      sale_expense_id: outcome === 'sold' ? saleExpenseId : row.sale_expense_id,
    })
    .eq('id', id)

  if (error) {
    if (outcome === 'sold' && saleExpenseId !== null && saleExpenseId !== row.sale_expense_id) {
      await supabase.from('expenses').delete().eq('id', saleExpenseId)
    }
    return { ok: false, error: error.message }
  }

  revalidatePartsScreens(outcome === 'sold')
  return { ok: true }
}

/** Put a part back on the car. The sale expense, if there was one, stays. */
export async function refitPartAction(raw: unknown): Promise<ActionResult> {
  const parsed = partIdSchema.safeParse(raw)
  if (!parsed.success) return { ok: false, error: 'Unknown part' }

  const supabase = await createClient()
  const { error } = await supabase
    .from('parts')
    .update({ status: 'on_car', removed_on: null })
    .eq('id', parsed.data)

  if (error) return { ok: false, error: error.message }

  revalidatePartsScreens()
  return { ok: true }
}

/**
 * Delete a part. The expenses it points at are left where they are: the money
 * was really spent and really came back, and the ledger is where a wrong
 * expense gets deleted.
 */
export async function deletePartAction(rawId: unknown): Promise<ActionResult> {
  const parsed = partIdSchema.safeParse(rawId)
  if (!parsed.success) return { ok: false, error: 'Unknown part' }

  const supabase = await createClient()
  const { error } = await supabase.from('parts').delete().eq('id', parsed.data)
  if (error) return { ok: false, error: error.message }

  revalidatePartsScreens()
  return { ok: true }
}
