'use server'

/**
 * Every expense write in the app goes through one of these.
 *
 * They are deliberately thin: parse with the shared zod schema, stamp the user,
 * write, revalidate. Bucket and budget-impact resolution happens in the form,
 * against `lib/budget.ts`, and the database enforces the invariant that a car
 * bucket has a car — so a request that got past the form and lies about it
 * fails on a check constraint rather than being quietly corrected here.
 */

import { revalidatePath } from 'next/cache'
import type { UndoSnapshot } from '@/app/(app)/undo/snapshot'
import { createClient } from '@/lib/supabase/server'
import { syncAttachments } from '@/lib/attachments/server'
import { expenseIdSchema, expenseWriteSchema, type ExpenseWrite } from '@/lib/expenses/schema'
import { fetchLedgerPage, LEDGER_PAGE_SIZE, type LedgerPage } from '@/lib/queries/expenses'
import type { LedgerCursor } from '@/lib/expenses/types'
import type { LedgerFilters } from '@/lib/expenses/filters'
import type { TablesInsert } from '@/lib/supabase/types'

/**
 * What every write in this app returns.
 *
 * `undo` is the rows a destructive write took away, photographed on the way
 * past. A toast that offers Undo hands it straight back to `restoreSnapshot`.
 * Optional, because most writes take nothing away. See `app/(app)/undo`.
 */
export type ActionResult =
  | { ok: true; undo?: UndoSnapshot }
  | { ok: false; error: string }

/**
 * The screens an expense write can change.
 *
 * `/garage` is in the list because a car expense moves that vehicle's lifetime
 * totals, and an expense carrying a `mod_plan_id` moves the actual on a card and
 * the planning-accuracy figure that reads it.
 */
function revalidateExpenseScreens(): void {
  revalidatePath('/today')
  revalidatePath('/ledger')
  revalidatePath('/money')
  revalidatePath('/garage', 'layout')
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
    return issues[0]?.message ?? 'That expense is not valid'
  }
  return 'That expense is not valid'
}

/** The column set an expense write maps onto. */
function toRow(input: ExpenseWrite, userId: string) {
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
    // Absent means "do not touch": an edit from the ledger does not carry the
    // mod link and must not clear it. See `linkedUuid` in the schema.
    ...(input.mod_plan_id === undefined ? {} : { mod_plan_id: input.mod_plan_id }),
    ...(input.fund_id === undefined ? {} : { fund_id: input.fund_id }),
  }
}

/**
 * Take the cost of this expense out of the fund that was saved up for it.
 *
 * docs/01-PRODUCT.md, section G: "When a linked mod is marked installed, the
 * fund is drawn down and the expense is flagged `funded_from_fund`." The flag is
 * `expenses.fund_id` — the column the data model already defines as "set when
 * paid from a sinking fund" — and the drawdown is a negative contribution,
 * because a fund's balance is the sum of its contributions and nothing else
 * (docs/02-DATA-MODEL.md).
 *
 * The balance is read here rather than trusted from the browser, and the
 * drawdown is capped at it: a fund can be emptied but never pushed below zero,
 * because a sinking fund with minus two million in it is not a thing that
 * happened. A refund — a negative expense — draws nothing.
 *
 * Returns an error message, or null when there was nothing to do or it was done.
 */
async function drawDownFund(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string,
  input: ExpenseWrite,
): Promise<string | null> {
  if (!input.fund_id || input.amount <= 0) return null

  const { data, error } = await supabase
    .from('v_fund_status')
    .select('balance')
    .eq('fund_id', input.fund_id)
    .maybeSingle()

  if (error) return error.message
  if (!data) return 'That fund no longer exists'

  const drawdown = Math.min(input.amount, data.balance ?? 0)
  if (drawdown <= 0) return null

  const { error: written } = await supabase.from('fund_contributions').insert({
    user_id: userId,
    fund_id: input.fund_id,
    occurred_on: input.occurred_on,
    amount: -drawdown,
    note: input.merchant ?? input.note,
  })

  return written?.message ?? null
}

/**
 * Photos travel with the write rather than in a second call. They are already in
 * storage by the time this runs — the browser uploaded them while the sheet was
 * open — so what lands here is metadata, and it lands in the same round trip as
 * the expense so a save cannot half-succeed into a receipt with no expense.
 */
export async function createExpenseAction(
  raw: unknown,
  rawAttachments: unknown = [],
): Promise<ActionResult> {
  const parsed = expenseWriteSchema.safeParse(raw)
  if (!parsed.success) return { ok: false, error: firstIssue(parsed.error) }

  const userId = await currentUserId()
  if (!userId) return { ok: false, error: 'Sign in again to save this' }

  const supabase = await createClient()
  const { error } = await supabase.from('expenses').insert(toRow(parsed.data, userId))
  if (error) return { ok: false, error: error.message }

  const photoError = await syncAttachments('expense', parsed.data.id, userId, rawAttachments)
  if (photoError) return { ok: false, error: photoError }

  // On create only. Setting the fund is what spends it, so an edit that carried
  // the same column would spend it a second time.
  const fundError = await drawDownFund(supabase, userId, parsed.data)
  if (fundError) return { ok: false, error: fundError }

  revalidateExpenseScreens()
  return { ok: true }
}

export async function updateExpenseAction(
  raw: unknown,
  rawAttachments: unknown = [],
): Promise<ActionResult> {
  const parsed = expenseWriteSchema.safeParse(raw)
  if (!parsed.success) return { ok: false, error: firstIssue(parsed.error) }

  const userId = await currentUserId()
  if (!userId) return { ok: false, error: 'Sign in again to save this' }

  const supabase = await createClient()
  const { user_id: _userId, id, ...columns } = toRow(parsed.data, userId)
  const { error } = await supabase.from('expenses').update(columns).eq('id', id)
  if (error) return { ok: false, error: error.message }

  const photoError = await syncAttachments('expense', id, userId, rawAttachments)
  if (photoError) return { ok: false, error: photoError }

  revalidateExpenseScreens()
  return { ok: true }
}

/**
 * Hard delete. History that matters is soft-deleted elsewhere in the schema, but
 * an expense the user says was a mistake should leave no trace — the undo path
 * is `restoreExpenseAction`, which puts the same id back.
 *
 * The attachment rows cascade away with it. The storage objects are deliberately
 * left: they are what the undo needs to put the photos back, and an orphaned
 * object costs storage rather than correctness. See AUTOPILOT-NOTES.md.
 */
export async function deleteExpenseAction(rawId: unknown): Promise<ActionResult> {
  const parsed = expenseIdSchema.safeParse(rawId)
  if (!parsed.success) return { ok: false, error: 'Unknown expense' }

  const supabase = await createClient()
  const { error } = await supabase.from('expenses').delete().eq('id', parsed.data)
  if (error) return { ok: false, error: error.message }

  revalidateExpenseScreens()
  return { ok: true }
}

/**
 * Undo for a delete. The original `created_at` comes back with it, because the
 * ledger's keyset order is (occurred_on, created_at, id) and a restored row that
 * arrives with a fresh timestamp would reappear in the wrong place.
 */
export async function restoreExpenseAction(
  raw: unknown,
  createdAt?: string,
  rawAttachments: unknown = [],
): Promise<ActionResult> {
  const parsed = expenseWriteSchema.safeParse(raw)
  if (!parsed.success) return { ok: false, error: firstIssue(parsed.error) }

  const userId = await currentUserId()
  if (!userId) return { ok: false, error: 'Sign in again to restore this' }

  const supabase = await createClient()
  const row: TablesInsert<'expenses'> = toRow(parsed.data, userId)
  if (createdAt) row.created_at = createdAt

  const { error } = await supabase.from('expenses').insert(row)
  if (error) return { ok: false, error: error.message }

  // The rows went with the expense; the objects did not, so undoing a delete
  // brings the photographs back and not just the amount.
  const photoError = await syncAttachments('expense', parsed.data.id, userId, rawAttachments)
  if (photoError) return { ok: false, error: photoError }

  revalidateExpenseScreens()
  return { ok: true }
}

/**
 * The next keyset page, for the ledger's "Load older" control.
 *
 * A server action rather than a route handler so the query, the filters and the
 * RLS-scoped client all stay on the server and the browser receives rows only.
 */
export async function loadLedgerPageAction(
  filters: LedgerFilters,
  cursor: LedgerCursor | null,
): Promise<LedgerPage> {
  return fetchLedgerPage(filters, cursor, LEDGER_PAGE_SIZE)
}
