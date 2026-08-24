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
import { createClient } from '@/lib/supabase/server'
import { expenseIdSchema, expenseWriteSchema, type ExpenseWrite } from '@/lib/expenses/schema'
import { fetchLedgerPage, LEDGER_PAGE_SIZE, type LedgerPage } from '@/lib/queries/expenses'
import type { LedgerCursor } from '@/lib/expenses/types'
import type { LedgerFilters } from '@/lib/expenses/filters'
import type { TablesInsert } from '@/lib/supabase/types'

export type ActionResult = { ok: true } | { ok: false; error: string }

/** The screens an expense write can change. */
function revalidateExpenseScreens(): void {
  revalidatePath('/today')
  revalidatePath('/ledger')
  revalidatePath('/money')
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
  }
}

export async function createExpenseAction(raw: unknown): Promise<ActionResult> {
  const parsed = expenseWriteSchema.safeParse(raw)
  if (!parsed.success) return { ok: false, error: firstIssue(parsed.error) }

  const userId = await currentUserId()
  if (!userId) return { ok: false, error: 'Sign in again to save this' }

  const supabase = await createClient()
  const { error } = await supabase.from('expenses').insert(toRow(parsed.data, userId))
  if (error) return { ok: false, error: error.message }

  revalidateExpenseScreens()
  return { ok: true }
}

export async function updateExpenseAction(raw: unknown): Promise<ActionResult> {
  const parsed = expenseWriteSchema.safeParse(raw)
  if (!parsed.success) return { ok: false, error: firstIssue(parsed.error) }

  const userId = await currentUserId()
  if (!userId) return { ok: false, error: 'Sign in again to save this' }

  const supabase = await createClient()
  const { user_id: _userId, id, ...columns } = toRow(parsed.data, userId)
  const { error } = await supabase.from('expenses').update(columns).eq('id', id)
  if (error) return { ok: false, error: error.message }

  revalidateExpenseScreens()
  return { ok: true }
}

/**
 * Hard delete. History that matters is soft-deleted elsewhere in the schema, but
 * an expense the user says was a mistake should leave no trace — the undo path
 * is `restoreExpenseAction`, which puts the same id back.
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
export async function restoreExpenseAction(raw: unknown, createdAt?: string): Promise<ActionResult> {
  const parsed = expenseWriteSchema.safeParse(raw)
  if (!parsed.success) return { ok: false, error: firstIssue(parsed.error) }

  const userId = await currentUserId()
  if (!userId) return { ok: false, error: 'Sign in again to restore this' }

  const supabase = await createClient()
  const row: TablesInsert<'expenses'> = toRow(parsed.data, userId)
  if (createdAt) row.created_at = createdAt

  const { error } = await supabase.from('expenses').insert(row)
  if (error) return { ok: false, error: error.message }

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
