'use server'

/**
 * The one action an undo needs: put a snapshot back.
 *
 * The snapshot is taken on the server by `./snapshot.ts`, travels to the browser
 * inside a delete's result, and comes back here when somebody taps Undo. See
 * that file for why a generic insert into a named table is not a hole in this
 * app's security boundary — RLS is the boundary, and `user_id` is taken from the
 * session rather than from the payload.
 */

import { revalidatePath } from 'next/cache'

import { createClient } from '@/lib/supabase/server'
import { UNDOABLE, isUndoable, type UndoSnapshot } from '@/app/(app)/undo/snapshot'

/**
 * Put a snapshot back.
 *
 * Every row keeps its original id and its original `created_at`, because both
 * are load-bearing: the id is what the ledger, the timeline and every foreign
 * key point at, and `created_at` is half of the keyset order — a restored row
 * with a fresh timestamp comes back in the wrong place in the list.
 */
export async function restoreSnapshot(
  raw: unknown,
): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!Array.isArray(raw)) return { ok: false, error: 'Nothing to undo' }

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { ok: false, error: 'Sign in again to undo this' }

  const paths = new Set<string>()

  for (const group of raw as UndoSnapshot) {
    if (!group || typeof group !== 'object' || !isUndoable(String(group.table))) {
      return { ok: false, error: 'Nothing to undo' }
    }
    if (!Array.isArray(group.rows) || group.rows.length === 0) continue

    // The session decides whose rows these are, not the payload.
    const rows = group.rows.map((row) => ({ ...row, user_id: user.id }))

    const { error } = await supabase.from(group.table).insert(rows as never)
    if (error) return { ok: false, error: error.message }

    for (const path of UNDOABLE[group.table]) paths.add(path)
  }

  for (const path of paths) revalidatePath(path, path === '/garage' ? 'layout' : 'page')

  return { ok: true }
}
