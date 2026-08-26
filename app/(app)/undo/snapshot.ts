import 'server-only'

/**
 * Undo for the writes that take something away.
 *
 * docs/03-DESIGN.md: "Toasts appear bottom-centre above the FAB, 2.4s, with an
 * Undo action on every destructive or ambiguous write." Expenses, notes and the
 * five archive flows had one. The hard deletes — a fill-up, a part, a service
 * record, a fund, a contribution, a recurring template — did not, because each
 * would have needed its own restore action with its own schema, and six of those
 * is how a rule quietly becomes optional.
 *
 * So there is one. A delete action photographs the rows it is about to remove
 * and hands the photograph back in its result; the toast's Undo puts them back
 * through `restoreSnapshot` in `./actions.ts`.
 *
 * This half is server-only rather than a server action: the browser never takes
 * a photograph, it only ever hands one back.
 *
 * ### Why a generic insert is not a hole
 *
 * This action inserts rows the caller supplies into a table the caller names,
 * which looks alarming until you remember what the boundary in this app
 * actually is. Every one of these tables is RLS-protected on `user_id`, the
 * signed-in user's own token can already `POST /rest/v1/fuel_logs` through
 * PostgREST with any body they like, and `user_id` is overwritten here with the
 * session's id rather than taken from the payload. There is no reachable state
 * through this action that is not already reachable with a curl command and the
 * user's own key — and the table name is checked against a list either way.
 *
 * What it deliberately cannot do: update, delete, or touch a table that is not
 * on the list.
 */

import { createClient } from '@/lib/supabase/server'

/**
 * The tables an undo may put a row back into, and what to revalidate after.
 *
 * `attachments` is on the list because it is where the photographs live. They
 * cascade away with whatever owned them, so a snapshot that did not carry them
 * would restore a fill-up with its receipt missing — and the storage objects
 * themselves are never deleted, precisely so this can work.
 */
export const UNDOABLE = {
  fuel_logs: ['/garage'],
  parts: ['/garage'],
  service_records: ['/garage'],
  service_schedules: ['/garage'],
  funds: ['/money'],
  fund_contributions: ['/money'],
  recurring_expenses: ['/money', '/today'],
  expenses: ['/today', '/ledger', '/money', '/garage'],
  attachments: [],
} as const

export type UndoTable = keyof typeof UNDOABLE

/** One table's worth of rows, exactly as they were. */
export type UndoGroup = {
  table: UndoTable
  rows: Record<string, unknown>[]
}

/**
 * An ordered snapshot. Order is the contract: a group is inserted after the
 * groups before it, so whatever a row points at is already back in the table by
 * the time the row referencing it arrives.
 */
export type UndoSnapshot = UndoGroup[]

export function isUndoable(table: string): table is UndoTable {
  return Object.prototype.hasOwnProperty.call(UNDOABLE, table)
}

/**
 * Read the rows a delete is about to remove, so its toast can put them back.
 *
 * Called on the server immediately before the delete, inside the same action —
 * never from the browser, which is why it is not exported as an action itself.
 */
export async function snapshot(
  table: UndoTable,
  match: Record<string, string>,
): Promise<UndoGroup> {
  const supabase = await createClient()
  const { data } = await supabase.from(table).select('*').match(match)
  return { table, rows: (data ?? []) as Record<string, unknown>[] }
}

/** The attachments belonging to one record, whichever of the six columns it is. */
export async function snapshotAttachments(
  column:
    | 'expense_id'
    | 'mod_plan_id'
    | 'service_record_id'
    | 'fuel_log_id'
    | 'part_id'
    | 'timeline_note_id',
  id: string,
): Promise<UndoGroup> {
  return snapshot('attachments', { [column]: id })
}

/** Drops the empty groups, so a snapshot of nothing is `undefined` rather than noise. */
export function collect(...groups: UndoGroup[]): UndoSnapshot | undefined {
  const kept = groups.filter((group) => group.rows.length > 0)
  return kept.length > 0 ? kept : undefined
}
