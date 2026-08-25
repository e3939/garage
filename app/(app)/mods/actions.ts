'use server'

/**
 * Every mod write in the app goes through one of these.
 *
 * Same shape as the expense and vehicle actions — parse with the shared zod
 * schema, stamp the user, write, revalidate — with two things of its own.
 *
 * Dependencies are checked for cycles here rather than by a trigger, which is
 * what docs/02-DATA-MODEL.md asks for, and the reason is the message: a
 * constraint can refuse the write but it cannot say which two mods are waiting
 * on each other. See `lib/mods/graph.ts`.
 *
 * A drag is one statement. `mod_reorder` takes the whole set of rows whose
 * position changed and applies them together, because two cards briefly sharing
 * a board_order is a board that renders in an order nobody drew.
 */

import { revalidatePath } from 'next/cache'

import { createClient } from '@/lib/supabase/server'
import { syncAttachments } from '@/lib/attachments/server'
import { todayIso } from '@/lib/dates'
import { cycleError } from '@/lib/mods/graph'
import { fetchDependencyGraph } from '@/lib/queries/mods'
import {
  modArchiveSchema,
  modDependenciesSchema,
  modMovesSchema,
  modWriteSchema,
  type ModWrite,
} from '@/lib/mods/schema'
import type { ActionResult } from '@/app/(app)/expenses/actions'

/**
 * The screens a mod write can change: the board, the vehicle page's planning
 * accuracy, and the build log, which carries a row per mod.
 */
function revalidateModScreens(): void {
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
    return issues[0]?.message ?? 'That mod is not valid'
  }
  return 'That mod is not valid'
}

function toRow(input: ModWrite, userId: string) {
  return {
    id: input.id,
    user_id: userId,
    vehicle_id: input.vehicle_id,
    title: input.title,
    description: input.description,
    status: input.status,
    priority: input.priority,
    est_cost_min: input.est_cost_min,
    est_cost_max: input.est_cost_max,
    // A currency with no estimate on it is noise, the same way it is on a
    // vehicle's purchase price.
    currency:
      input.est_cost_min === null && input.est_cost_max === null ? null : input.currency,
    target_date: input.target_date,
    links: input.links,
    notes: input.notes,
    // A mod is installed on the day it is marked installed, and a mod that is
    // not installed has no such day. The board and the sheet both go through
    // here, so the stamp cannot get out of step with the column.
    installed_on: input.status === 'installed' ? (input.installed_on ?? todayIso()) : null,
  }
}

/**
 * Make the stored dependency set equal the one the sheet was holding, refusing
 * anything that would close a loop.
 *
 * Every id has to be a live mod on the same vehicle. Both halves of that matter:
 * RLS already stops a dependency pointing at somebody else's mod, and this stops
 * one pointing at a different car of your own, which RLS would happily allow and
 * which no screen could ever show you.
 *
 * Returns an error message, or null when the set was stored.
 */
async function syncDependencies(
  modId: string,
  vehicleId: string,
  title: string,
  dependsOn: readonly string[],
): Promise<string | null> {
  const { edges, titles } = await fetchDependencyGraph(vehicleId)
  titles.set(modId, title)

  const wanted = dependsOn.filter((id) => id !== modId)
  const stranger = wanted.find((id) => !titles.has(id))
  if (stranger) return 'One of those dependencies is not a mod on this car'

  const loop = cycleError(modId, wanted, edges, titles)
  if (loop) return loop

  const supabase = await createClient()

  const { error: cleared } = await supabase
    .from('mod_dependencies')
    .delete()
    .eq('mod_plan_id', modId)
  if (cleared) return cleared.message

  if (wanted.length === 0) return null

  const { error } = await supabase.from('mod_dependencies').insert(
    wanted.map((dependsOnId) => ({ mod_plan_id: modId, depends_on_id: dependsOnId })),
  )

  return error ? error.message : null
}

/** A new card goes to the end of the column it was created in. */
async function nextBoardOrder(vehicleId: string, status: ModWrite['status']): Promise<number> {
  const supabase = await createClient()
  const { count } = await supabase
    .from('mod_plans')
    .select('id', { count: 'exact', head: true })
    .eq('vehicle_id', vehicleId)
    .eq('status', status)
    .is('archived_at', null)
  return count ?? 0
}

export async function createModAction(
  raw: unknown,
  rawAttachments: unknown = [],
  rawDependsOn: unknown = [],
): Promise<ActionResult> {
  const parsed = modWriteSchema.safeParse(raw)
  if (!parsed.success) return { ok: false, error: firstIssue(parsed.error) }

  const deps = modDependenciesSchema.safeParse({
    mod_plan_id: parsed.data.id,
    depends_on: rawDependsOn,
  })
  if (!deps.success) return { ok: false, error: firstIssue(deps.error) }

  const userId = await currentUserId()
  if (!userId) return { ok: false, error: 'Sign in again to save this' }

  const supabase = await createClient()
  const board_order = await nextBoardOrder(parsed.data.vehicle_id, parsed.data.status)

  const { error } = await supabase
    .from('mod_plans')
    .insert({ ...toRow(parsed.data, userId), board_order })
  if (error) return { ok: false, error: error.message }

  const photoError = await syncAttachments('mod_plan', parsed.data.id, userId, rawAttachments)
  if (photoError) return { ok: false, error: photoError }

  const dependencyError = await syncDependencies(
    parsed.data.id,
    parsed.data.vehicle_id,
    parsed.data.title,
    deps.data.depends_on,
  )
  if (dependencyError) return { ok: false, error: dependencyError }

  revalidateModScreens()
  return { ok: true }
}

export async function updateModAction(
  raw: unknown,
  rawAttachments: unknown = [],
  rawDependsOn: unknown = [],
): Promise<ActionResult> {
  const parsed = modWriteSchema.safeParse(raw)
  if (!parsed.success) return { ok: false, error: firstIssue(parsed.error) }

  const deps = modDependenciesSchema.safeParse({
    mod_plan_id: parsed.data.id,
    depends_on: rawDependsOn,
  })
  if (!deps.success) return { ok: false, error: firstIssue(deps.error) }

  const userId = await currentUserId()
  if (!userId) return { ok: false, error: 'Sign in again to save this' }

  // The loop check runs before the write, not after it: a refused dependency set
  // should leave the mod exactly as it was, not save the title and reject the
  // rest.
  const dependencyError = await syncDependencies(
    parsed.data.id,
    parsed.data.vehicle_id,
    parsed.data.title,
    deps.data.depends_on,
  )
  if (dependencyError) return { ok: false, error: dependencyError }

  const supabase = await createClient()
  const { user_id: _userId, id, ...columns } = toRow(parsed.data, userId)
  const { error } = await supabase.from('mod_plans').update(columns).eq('id', id)
  if (error) return { ok: false, error: error.message }

  const photoError = await syncAttachments('mod_plan', id, userId, rawAttachments)
  if (photoError) return { ok: false, error: photoError }

  revalidateModScreens()
  return { ok: true }
}

/**
 * Archive, not delete — the same reasoning as a vehicle. A mod you stopped
 * wanting may still have expenses pointing at it, and those are real money that
 * was really spent. `archived_at` takes the card off the board and the row out
 * of the build log and leaves every figure it earned intact, and the undo is one
 * tap.
 */
export async function setModArchivedAction(raw: unknown): Promise<ActionResult> {
  const parsed = modArchiveSchema.safeParse(raw)
  if (!parsed.success) return { ok: false, error: 'Unknown mod' }

  const supabase = await createClient()
  const { error } = await supabase
    .from('mod_plans')
    .update({ archived_at: parsed.data.archived ? new Date().toISOString() : null })
    .eq('id', parsed.data.id)

  if (error) return { ok: false, error: error.message }

  revalidateModScreens()
  return { ok: true }
}

/**
 * Persist a drag. One RPC, one statement, whatever the drag touched.
 *
 * The board has already redrawn itself by the time this runs — the drop is
 * optimistic — so what this returns only matters when it fails, and then it
 * matters a lot: the caller puts the board back the way it was and says why.
 */
export async function moveModsAction(raw: unknown): Promise<ActionResult> {
  const parsed = modMovesSchema.safeParse(raw)
  if (!parsed.success) return { ok: false, error: firstIssue(parsed.error) }

  const supabase = await createClient()
  const { error } = await supabase.rpc('mod_reorder', {
    p_vehicle_id: parsed.data.vehicle_id,
    p_moves: parsed.data.moves,
    p_today: parsed.data.today,
  })

  if (error) return { ok: false, error: error.message }

  revalidateModScreens()
  return { ok: true }
}
