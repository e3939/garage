'use server'

/**
 * Budget writes.
 *
 * Both of them are one RPC each, and that is the point: the sheet edits an
 * overall figure and a set of category caps as one thing, so they have to land
 * as one thing. Doing it here as a delete and then two inserts would leave a
 * window where the month has no budget at all, and a crash inside that window
 * would leave it that way.
 *
 * Nothing in this file does arithmetic. `save_budgets` and `copy_budgets_from`
 * run under the caller's own RLS policies — `auth.uid()` is what stamps every
 * row — so neither can touch a month belonging to anybody else.
 */

import { revalidatePath } from 'next/cache'

import { createClient } from '@/lib/supabase/server'
import { copyBudgetsSchema, saveBudgetsSchema } from '@/lib/budgets/schema'
import type { ActionResult } from '@/app/(app)/expenses/actions'

function firstIssue(error: unknown, fallback: string): string {
  if (error && typeof error === 'object' && 'issues' in error) {
    const issues = (error as { issues: { message: string }[] }).issues
    return issues[0]?.message ?? fallback
  }
  return fallback
}

export async function saveBudgetsAction(raw: unknown): Promise<ActionResult> {
  const parsed = saveBudgetsSchema.safeParse(raw)
  if (!parsed.success) return { ok: false, error: firstIssue(parsed.error, 'That budget is not valid') }

  const { month, currency, overall, caps } = parsed.data

  // A cap on the same category twice would hit the unique constraint and roll
  // the whole month back. The sheet cannot produce one — it holds a field per
  // category — so this is about a request that did not come from the sheet.
  const seen = new Set<string>()
  for (const cap of caps) {
    if (seen.has(cap.category_id)) return { ok: false, error: 'One cap per category' }
    seen.add(cap.category_id)
  }

  const supabase = await createClient()
  const { error } = await supabase.rpc('save_budgets', {
    p_month: month,
    p_currency: currency,
    p_overall: overall ?? undefined,
    p_caps: caps.filter((cap) => cap.amount !== null),
  })

  if (error) return { ok: false, error: error.message }

  revalidatePath('/money')
  return { ok: true }
}

/**
 * Last month again, as a starting point.
 *
 * Insert-only in SQL: anything already set for the target month wins. The button
 * is only offered on a month with no budget of its own, but the guarantee is in
 * the function rather than in the screen, because a screen is a suggestion.
 */
export async function copyBudgetsAction(raw: unknown): Promise<ActionResult> {
  const parsed = copyBudgetsSchema.safeParse(raw)
  if (!parsed.success) return { ok: false, error: 'Unknown month' }

  const supabase = await createClient()
  const { error } = await supabase.rpc('copy_budgets_from', {
    p_from: parsed.data.from,
    p_to: parsed.data.to,
  })

  if (error) return { ok: false, error: error.message }

  revalidatePath('/money')
  return { ok: true }
}
