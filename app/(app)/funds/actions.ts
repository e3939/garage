'use server'

/**
 * Fund writes.
 *
 * Same shape as every other action file — parse with the shared zod schema,
 * stamp the user, write, revalidate — with one rule of its own: **the balance is
 * never written.** docs/02-DATA-MODEL.md is explicit that a fund's balance is
 * the sum of its contributions and that no running total is stored, so putting
 * money in and taking money out are the same operation with a different sign.
 * A drawdown is a negative contribution; there is no separate table, no separate
 * column and no second code path that could disagree with the first.
 */

import { revalidatePath } from 'next/cache'

import { createClient } from '@/lib/supabase/server'
import {
  fundCloseSchema,
  fundContributionIdSchema,
  fundContributionSchema,
  fundIdSchema,
  fundWriteSchema,
  type FundWrite,
} from '@/lib/funds/schema'
import type { ActionResult } from '@/app/(app)/expenses/actions'

/**
 * A fund shows up on the money screen and, when it is linked to a mod, in the
 * mark-installed flow on the board.
 */
function revalidateFundScreens(): void {
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

function firstIssue(error: unknown, fallback: string): string {
  if (error && typeof error === 'object' && 'issues' in error) {
    const issues = (error as { issues: { message: string }[] }).issues
    return issues[0]?.message ?? fallback
  }
  return fallback
}

function toRow(input: FundWrite, userId: string) {
  return {
    id: input.id,
    user_id: userId,
    name: input.name,
    vehicle_id: input.vehicle_id,
    mod_plan_id: input.mod_plan_id,
    target_amount: input.target_amount,
    monthly_contribution: input.monthly_contribution,
    currency: input.currency,
  }
}

export async function createFundAction(raw: unknown): Promise<ActionResult> {
  const parsed = fundWriteSchema.safeParse(raw)
  if (!parsed.success) return { ok: false, error: firstIssue(parsed.error, 'That fund is not valid') }

  const userId = await currentUserId()
  if (!userId) return { ok: false, error: 'Sign in again to save this' }

  const supabase = await createClient()
  const { error } = await supabase.from('funds').insert(toRow(parsed.data, userId))
  if (error) return { ok: false, error: error.message }

  revalidateFundScreens()
  return { ok: true }
}

export async function updateFundAction(raw: unknown): Promise<ActionResult> {
  const parsed = fundWriteSchema.safeParse(raw)
  if (!parsed.success) return { ok: false, error: firstIssue(parsed.error, 'That fund is not valid') }

  const userId = await currentUserId()
  if (!userId) return { ok: false, error: 'Sign in again to save this' }

  const supabase = await createClient()
  const { user_id: _userId, id, ...columns } = toRow(parsed.data, userId)
  const { error } = await supabase.from('funds').update(columns).eq('id', id)
  if (error) return { ok: false, error: error.message }

  revalidateFundScreens()
  return { ok: true }
}

/**
 * Closing a fund, not deleting it.
 *
 * The contributions are a record of money that moved, and a fund that reached
 * its target is the most satisfying thing on the screen. `closed_at` takes it
 * off the active list and out of the drawdown offer, which is every visible
 * consequence of a delete, and it comes back with one tap.
 */
export async function setFundClosedAction(raw: unknown): Promise<ActionResult> {
  const parsed = fundCloseSchema.safeParse(raw)
  if (!parsed.success) return { ok: false, error: 'Unknown fund' }

  const supabase = await createClient()
  const { error } = await supabase
    .from('funds')
    .update({ closed_at: parsed.data.closed ? new Date().toISOString() : null })
    .eq('id', parsed.data.id)

  if (error) return { ok: false, error: error.message }

  revalidateFundScreens()
  return { ok: true }
}

/**
 * Delete a fund outright. Only offered on one that has never been contributed
 * to — anything else is closed instead, because the contributions cascade with
 * it and a log of real money is not something to lose to a mis-tap.
 */
export async function deleteFundAction(rawId: unknown): Promise<ActionResult> {
  const parsed = fundIdSchema.safeParse(rawId)
  if (!parsed.success) return { ok: false, error: 'Unknown fund' }

  const supabase = await createClient()
  const { error } = await supabase.from('funds').delete().eq('id', parsed.data)
  if (error) return { ok: false, error: error.message }

  revalidateFundScreens()
  return { ok: true }
}

/**
 * Log a contribution. A negative amount is a drawdown, and the sheet says so in
 * words before it writes one.
 */
export async function logContributionAction(raw: unknown): Promise<ActionResult> {
  const parsed = fundContributionSchema.safeParse(raw)
  if (!parsed.success) {
    return { ok: false, error: firstIssue(parsed.error, 'That contribution is not valid') }
  }

  const userId = await currentUserId()
  if (!userId) return { ok: false, error: 'Sign in again to save this' }

  const supabase = await createClient()
  const { error } = await supabase.from('fund_contributions').insert({
    id: parsed.data.id,
    user_id: userId,
    fund_id: parsed.data.fund_id,
    occurred_on: parsed.data.occurred_on,
    amount: parsed.data.amount,
    note: parsed.data.note,
  })

  if (error) return { ok: false, error: error.message }

  revalidateFundScreens()
  return { ok: true }
}

export async function deleteContributionAction(rawId: unknown): Promise<ActionResult> {
  const parsed = fundContributionIdSchema.safeParse(rawId)
  if (!parsed.success) return { ok: false, error: 'Unknown contribution' }

  const supabase = await createClient()
  const { error } = await supabase.from('fund_contributions').delete().eq('id', parsed.data)
  if (error) return { ok: false, error: error.message }

  revalidateFundScreens()
  return { ok: true }
}
