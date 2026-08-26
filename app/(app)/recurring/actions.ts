'use server'

/**
 * Recurring templates, and the tray that stands between a generated draft and
 * the ledger.
 *
 * The rule the whole feature exists to keep is in docs/01-PRODUCT.md: recurring
 * expenses "generate a draft on the due date and sit in an 'Awaiting
 * confirmation' tray until confirmed. Never silently created." So confirming is
 * a write a person makes, and until they make it the row is `is_draft = true`
 * and is invisible to `v_expense_impact`, `v_month_totals`, `v_timeline`,
 * `ledger_page` and every figure in the app.
 *
 * The templates themselves are ordinary rows under ordinary RLS. The only thing
 * that writes drafts is `generate_due_recurrences`, which the cron job calls;
 * nothing here can create one, which is why there is no "generate now" action.
 */

import { revalidatePath } from 'next/cache'

import { createClient } from '@/lib/supabase/server'
import {
  confirmDraftSchema,
  draftIdSchema,
  recurringActiveSchema,
  recurringIdSchema,
  recurringWriteSchema,
  type RecurringWrite,
} from '@/lib/recurring/schema'
import type { ActionResult } from '@/app/(app)/expenses/actions'
import { collect, snapshot } from '@/app/(app)/undo/snapshot'

/** A template moves the recurring screen; a confirmed draft moves everything. */
function revalidateRecurringScreens(withLedger = false): void {
  revalidatePath('/money')
  revalidatePath('/today')
  if (withLedger) {
    revalidatePath('/ledger')
    revalidatePath('/garage', 'layout')
  }
}

async function currentUserId(): Promise<string | null> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  return user?.id ?? null
}

function firstIssue(error: unknown, fallback: string): string {
  if (error && typeof error === 'object' && 'issues' in error) {
    const issues = (error as { issues: { message: string }[] }).issues
    return issues[0]?.message ?? fallback
  }
  return fallback
}

function toRow(input: RecurringWrite, userId: string) {
  return {
    id: input.id,
    user_id: userId,
    label: input.label,
    amount: input.amount,
    currency: input.currency,
    category_id: input.category_id,
    vehicle_id: input.vehicle_id,
    bucket: input.bucket,
    counts_toward_budget: input.counts_toward_budget,
    cadence: input.cadence,
    day_of_month: input.day_of_month,
    month_of_year: input.month_of_year,
    next_due: input.next_due,
    active: input.active,
  }
}

export async function createRecurringAction(raw: unknown): Promise<ActionResult> {
  const parsed = recurringWriteSchema.safeParse(raw)
  if (!parsed.success) return { ok: false, error: firstIssue(parsed.error, 'That template is not valid') }

  const userId = await currentUserId()
  if (!userId) return { ok: false, error: 'Sign in again to save this' }

  const supabase = await createClient()
  const { error } = await supabase.from('recurring_expenses').insert(toRow(parsed.data, userId))
  if (error) return { ok: false, error: error.message }

  revalidateRecurringScreens()
  return { ok: true }
}

export async function updateRecurringAction(raw: unknown): Promise<ActionResult> {
  const parsed = recurringWriteSchema.safeParse(raw)
  if (!parsed.success) return { ok: false, error: firstIssue(parsed.error, 'That template is not valid') }

  const userId = await currentUserId()
  if (!userId) return { ok: false, error: 'Sign in again to save this' }

  const supabase = await createClient()
  const { user_id: _userId, id, ...columns } = toRow(parsed.data, userId)
  const { error } = await supabase.from('recurring_expenses').update(columns).eq('id', id)
  if (error) return { ok: false, error: error.message }

  revalidateRecurringScreens()
  return { ok: true }
}

/**
 * The active toggle. Pausing a template is the common case — a subscription on
 * hold, a car off the road for a month — and it is one tap rather than a delete
 * and a re-entry.
 */
export async function setRecurringActiveAction(raw: unknown): Promise<ActionResult> {
  const parsed = recurringActiveSchema.safeParse(raw)
  if (!parsed.success) return { ok: false, error: 'Unknown template' }

  const supabase = await createClient()
  const { error } = await supabase
    .from('recurring_expenses')
    .update({ active: parsed.data.active })
    .eq('id', parsed.data.id)

  if (error) return { ok: false, error: error.message }

  revalidateRecurringScreens()
  return { ok: true }
}

/**
 * Delete a template. Any drafts it has already generated stay where they are —
 * they are waiting on a decision about money that is about to move, and that
 * decision does not change because the template behind them was tidied up.
 * `expenses.recurring_id` is nullable and has no cascade, so the link is simply
 * dropped.
 */
export async function deleteRecurringAction(rawId: unknown): Promise<ActionResult> {
  const parsed = recurringIdSchema.safeParse(rawId)
  if (!parsed.success) return { ok: false, error: 'Unknown template' }

  const supabase = await createClient()

  const undo = collect(await snapshot('recurring_expenses', { id: parsed.data }))

  const { error: unlinked } = await supabase
    .from('expenses')
    .update({ recurring_id: null })
    .eq('recurring_id', parsed.data)
  if (unlinked) return { ok: false, error: unlinked.message }

  const { error } = await supabase.from('recurring_expenses').delete().eq('id', parsed.data)
  if (error) return { ok: false, error: error.message }

  revalidateRecurringScreens()
  // The drafts this template had already generated keep their loosened link.
  // Putting the template back does not re-attach them, which is the honest
  // outcome: they are decisions about money, not children of the template.
  return { ok: true, undo }
}

/**
 * Confirm a draft: the amount as corrected, and the flag cleared.
 *
 * Clearing `is_draft` is the moment the expense becomes real — it enters
 * `v_expense_impact` and therefore the month, the budget arc, the ledger and the
 * build log in the same write. The amount is editable because a template is a
 * guess about a bill that had not arrived yet; nothing else is, because a draft
 * needing more than that is one to confirm and then edit like any other expense.
 */
export async function confirmDraftAction(raw: unknown): Promise<ActionResult> {
  const parsed = confirmDraftSchema.safeParse(raw)
  if (!parsed.success) return { ok: false, error: firstIssue(parsed.error, 'That draft is not valid') }

  const supabase = await createClient()
  const { error } = await supabase
    .from('expenses')
    .update({ amount: parsed.data.amount, is_draft: false })
    .eq('id', parsed.data.id)
    .eq('is_draft', true)

  if (error) return { ok: false, error: error.message }

  revalidateRecurringScreens(true)
  return { ok: true }
}

/**
 * Dismiss a draft. A hard delete, because a draft is a suggestion and a rejected
 * suggestion should leave nothing behind. The template keeps its schedule and
 * will offer again next period.
 */
export async function discardDraftAction(rawId: unknown): Promise<ActionResult> {
  const parsed = draftIdSchema.safeParse(rawId)
  if (!parsed.success) return { ok: false, error: 'Unknown draft' }

  const supabase = await createClient()

  const undo = collect(await snapshot('expenses', { id: parsed.data, is_draft: 'true' }))

  const { error } = await supabase
    .from('expenses')
    .delete()
    .eq('id', parsed.data)
    .eq('is_draft', true)

  if (error) return { ok: false, error: error.message }

  revalidateRecurringScreens()
  return { ok: true, undo }
}
