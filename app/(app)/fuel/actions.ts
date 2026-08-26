'use server'

/**
 * Every fuel write in the app goes through one of these.
 *
 * A fill-up and the expense that paid for it land in one call, the same way a
 * service record and its expense do. `fuel_logs.expense_id` is in the data model
 * to say which money paid for which tank, and a log whose fills never reach the
 * ledger would leave fuel — the largest running cost most cars have — out of
 * every cost-per-km figure in the app.
 */

import { revalidatePath } from 'next/cache'

import { createClient } from '@/lib/supabase/server'
import { syncAttachments } from '@/lib/attachments/server'
import { fuelLogIdSchema, fuelLogSchema, fuelLogWriteSchema, type FuelLogWrite } from '@/lib/fuel/schema'
import type { ExpenseWrite } from '@/lib/expenses/schema'
import type { ActionResult } from '@/app/(app)/expenses/actions'
import { collect, snapshot, snapshotAttachments } from '@/app/(app)/undo/snapshot'

function revalidateFuelScreens(withExpense = false): void {
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
    return issues[0]?.message ?? 'That fill-up is not valid'
  }
  return 'That fill-up is not valid'
}

/**
 * The unique key is (vehicle_id, filled_on, odometer_km), which exists so the
 * same receipt cannot be logged twice. The constraint name is not copy.
 */
function describe(message: string): string {
  if (message.includes('fuel_logs_fill_key')) {
    return 'There is already a fill-up on that date at that reading'
  }
  return message
}

function logRow(input: FuelLogWrite, userId: string) {
  return {
    id: input.id,
    user_id: userId,
    vehicle_id: input.vehicle_id,
    filled_on: input.filled_on,
    odometer_km: input.odometer_km,
    litres: input.litres,
    total_cost: input.total_cost,
    currency: input.currency,
    is_full_tank: input.is_full_tank,
    missed_previous: input.missed_previous,
    station: input.station,
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
  }
}

export async function createFuelLogAction(
  raw: unknown,
  rawAttachments: unknown = [],
): Promise<ActionResult> {
  const parsed = fuelLogWriteSchema.safeParse(raw)
  if (!parsed.success) return { ok: false, error: firstIssue(parsed.error) }

  const userId = await currentUserId()
  if (!userId) return { ok: false, error: 'Sign in again to save this' }

  const supabase = await createClient()
  const { log, expense } = parsed.data

  let expenseId: string | null = null
  if (expense) {
    const { error } = await supabase.from('expenses').insert(expenseRow(expense, userId))
    if (error) return { ok: false, error: error.message }
    expenseId = expense.id
  }

  const { error } = await supabase
    .from('fuel_logs')
    .insert({ ...logRow(log, userId), expense_id: expenseId })

  if (error) {
    // An expense paying for a fill-up that was refused is a mystery row in the
    // ledger. Take it back out.
    if (expenseId) await supabase.from('expenses').delete().eq('id', expenseId)
    return { ok: false, error: describe(error.message) }
  }

  const photoError = await syncAttachments('fuel_log', log.id, userId, rawAttachments)
  if (photoError) return { ok: false, error: photoError }

  revalidateFuelScreens(expense !== null)
  return { ok: true }
}

/**
 * Edit a fill-up. The linked expense's amount and date move with it, because the
 * two are one event and a receipt that says 920,000 in the fuel log and 950,000
 * in the ledger is a bug somebody will spend an evening on.
 */
export async function updateFuelLogAction(
  raw: unknown,
  rawAttachments: unknown = [],
): Promise<ActionResult> {
  const parsed = fuelLogSchema.safeParse(raw)
  if (!parsed.success) return { ok: false, error: firstIssue(parsed.error) }

  const userId = await currentUserId()
  if (!userId) return { ok: false, error: 'Sign in again to save this' }

  const supabase = await createClient()
  const { user_id: _userId, id, ...columns } = logRow(parsed.data, userId)

  const { data: existing } = await supabase
    .from('fuel_logs')
    .select('expense_id')
    .eq('id', id)
    .maybeSingle()

  const { error } = await supabase.from('fuel_logs').update(columns).eq('id', id)
  if (error) return { ok: false, error: describe(error.message) }

  if (existing?.expense_id) {
    await supabase
      .from('expenses')
      .update({
        amount: parsed.data.total_cost,
        currency: parsed.data.currency,
        occurred_on: parsed.data.filled_on,
        odometer_km: parsed.data.odometer_km,
        merchant: parsed.data.station,
      })
      .eq('id', existing.expense_id)
  }

  const photoError = await syncAttachments('fuel_log', id, userId, rawAttachments)
  if (photoError) return { ok: false, error: photoError }

  revalidateFuelScreens(Boolean(existing?.expense_id))
  return { ok: true }
}

/**
 * Delete a fill-up, and the expense it wrote.
 *
 * Unlike a service record, the expense here was created by this screen and
 * exists only because the fill-up does — it is the same event, not a payment
 * that happened to be recorded alongside. Leaving it would put fuel spend in the
 * ledger for a tank the log says never happened.
 */
export async function deleteFuelLogAction(rawId: unknown): Promise<ActionResult> {
  const parsed = fuelLogIdSchema.safeParse(rawId)
  if (!parsed.success) return { ok: false, error: 'Unknown fill-up' }

  const supabase = await createClient()

  const { data: existing } = await supabase
    .from('fuel_logs')
    .select('expense_id')
    .eq('id', parsed.data)
    .maybeSingle()

  // Photographed before anything is removed, so the toast can put the tank, the
  // money it cost and the picture of the receipt all back. The expense goes
  // first in the snapshot because the fill-up's `expense_id` points at it.
  const undo = collect(
    existing?.expense_id
      ? await snapshot('expenses', { id: existing.expense_id })
      : { table: 'expenses' as const, rows: [] },
    await snapshot('fuel_logs', { id: parsed.data }),
    await snapshotAttachments('fuel_log_id', parsed.data),
    existing?.expense_id
      ? await snapshotAttachments('expense_id', existing.expense_id)
      : { table: 'attachments' as const, rows: [] },
  )

  const { error } = await supabase.from('fuel_logs').delete().eq('id', parsed.data)
  if (error) return { ok: false, error: error.message }

  if (existing?.expense_id) {
    await supabase.from('expenses').delete().eq('id', existing.expense_id)
  }

  revalidateFuelScreens(Boolean(existing?.expense_id))
  return { ok: true, undo }
}
