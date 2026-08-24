/**
 * The optimistic layer.
 *
 * A write is shown before the server has agreed to it, which means the client
 * has to answer two questions on its own: where does this row belong in the
 * list, and what does it do to the month. Both are answered here, as pure
 * functions over the rows the server already sent plus the writes in flight.
 *
 * The month figure uses `impactInMonth` from `lib/budget.ts`, which is the
 * mirror of `v_expense_impact`. Nothing in here invents a second amortisation
 * rule; if the two ever disagree, the view is right and this is the bug.
 */

import { impactInMonth } from '@/lib/budget'
import type { IsoDate } from '@/lib/dates'
import { matchesFilters, type LedgerFilters } from '@/lib/expenses/filters'
import type { ExpenseWrite } from '@/lib/expenses/schema'
import type { CategoryOption, LedgerRow, VehicleOption } from '@/lib/expenses/types'

export type PendingOp =
  /** A create (`previous` null) or an edit (`previous` is the row as it was). */
  | { kind: 'save'; row: LedgerRow; previous: LedgerRow | null }
  | { kind: 'delete'; row: LedgerRow }

export type OptimisticRow = LedgerRow & { pending: boolean }

export type OptimisticLedger = {
  rows: OptimisticRow[]
  /** Per-day adjustment to add to the subtotal SQL computed. */
  dayDelta: Map<IsoDate, number>
}

function descending(a: LedgerRow, b: LedgerRow): number {
  if (a.occurred_on !== b.occurred_on) return a.occurred_on < b.occurred_on ? 1 : -1
  if (a.created_at !== b.created_at) return a.created_at < b.created_at ? 1 : -1
  return a.id < b.id ? 1 : a.id > b.id ? -1 : 0
}

/**
 * Fold the writes in flight into the page the server sent.
 *
 * A pending row keeps the day figures of the day it lands in so the heading
 * stays consistent; a row landing on a day that is not on screen starts from
 * zero and is carried entirely by the delta.
 */
export function applyPending(
  serverRows: readonly LedgerRow[],
  ops: readonly PendingOp[],
  filters: LedgerFilters,
): OptimisticLedger {
  const byId = new Map<string, OptimisticRow>()
  for (const row of serverRows) byId.set(row.id, { ...row, pending: false })

  const dayDelta = new Map<IsoDate, number>()
  const bump = (day: IsoDate, amount: number) => {
    dayDelta.set(day, (dayDelta.get(day) ?? 0) + amount)
  }

  /** The day figures SQL gave for a day already on screen, if any. */
  const dayFigures = (day: IsoDate) => {
    for (const row of byId.values()) {
      if (row.occurred_on === day && row.day_count > 0) {
        return { day_total: row.day_total, day_count: row.day_count }
      }
    }
    return { day_total: 0, day_count: 0 }
  }

  for (const op of ops) {
    const existing = byId.get(op.row.id)

    if (op.kind === 'delete') {
      if (!existing) continue
      byId.delete(existing.id)
      bump(existing.occurred_on, -existing.amount)
      continue
    }

    const visible = matchesFilters(op.row, filters)

    if (existing) {
      bump(existing.occurred_on, -existing.amount)
      byId.delete(existing.id)
      if (!visible) continue
      bump(op.row.occurred_on, op.row.amount)
      const figures =
        existing.occurred_on === op.row.occurred_on
          ? { day_total: existing.day_total, day_count: existing.day_count }
          : dayFigures(op.row.occurred_on)
      byId.set(op.row.id, { ...op.row, ...figures, pending: true })
      continue
    }

    if (!visible) continue
    bump(op.row.occurred_on, op.row.amount)
    byId.set(op.row.id, { ...op.row, ...dayFigures(op.row.occurred_on), pending: true })
  }

  return { rows: [...byId.values()].sort(descending), dayDelta }
}

function impactOf(row: LedgerRow, month: IsoDate): number {
  return impactInMonth(
    {
      amount: row.amount,
      occurred_on: row.occurred_on,
      amortize_months: row.amortize_months,
      counts_toward_budget: row.counts_toward_budget,
      is_draft: row.is_draft,
    },
    month,
  )
}

/**
 * What the writes in flight do to one month's budget figure. Rows in another
 * currency are ignored rather than added: money is never mixed without a stored
 * rate (CLAUDE.md section 5).
 */
export function pendingMonthDelta(
  ops: readonly PendingOp[],
  month: IsoDate,
  currency: string,
): number {
  let delta = 0
  for (const op of ops) {
    if (op.kind === 'delete') {
      if (op.row.currency === currency) delta -= impactOf(op.row, month)
      continue
    }
    if (op.previous && op.previous.currency === currency) delta -= impactOf(op.previous, month)
    if (op.row.currency === currency) delta += impactOf(op.row, month)
  }
  return delta
}

// ---------------------------------------------------------------------------
// Grouping
// ---------------------------------------------------------------------------

export type LedgerItem =
  | { kind: 'day'; key: string; date: IsoDate; total: number }
  | { kind: 'expense'; key: string; row: OptimisticRow }

/**
 * Flatten rows into the list the ledger renders: a heading per day, then its
 * rows. The heading's subtotal is the figure `ledger_page` computed for the
 * whole day under the current filters, plus whatever is still in flight — so a
 * day split across two pages shows the same number on both.
 */
export function buildLedgerItems(ledger: OptimisticLedger): LedgerItem[] {
  const items: LedgerItem[] = []
  const headings = new Map<IsoDate, Extract<LedgerItem, { kind: 'day' }>>()
  const seeded = new Set<IsoDate>()

  for (const row of ledger.rows) {
    let heading = headings.get(row.occurred_on)
    if (!heading) {
      heading = { kind: 'day', key: `day-${row.occurred_on}`, date: row.occurred_on, total: 0 }
      headings.set(row.occurred_on, heading)
      items.push(heading)
    }
    // Every server row of a day carries the same SQL subtotal; take it once.
    if (!seeded.has(row.occurred_on) && row.day_count > 0) {
      seeded.add(row.occurred_on)
      heading.total = row.day_total
    }
    items.push({ kind: 'expense', key: row.id, row })
  }

  for (const heading of headings.values()) {
    heading.total += ledger.dayDelta.get(heading.date) ?? 0
  }

  return items
}

// ---------------------------------------------------------------------------
// Building the row the user sees before the server has one
// ---------------------------------------------------------------------------

/**
 * Turn a validated write into the ledger row it will become.
 *
 * Day figures start at zero: `applyPending` fills them in from whatever the
 * server already said about that day, or leaves them at zero when the day is not
 * on screen yet. Attachments are always zero — a row cannot have a photo before
 * it exists, and the upload pipeline is roadmap Phase 4.
 */
export function draftLedgerRow(
  write: ExpenseWrite,
  context: {
    category: CategoryOption | null
    vehicle: VehicleOption | null
    createdAt: string
    attachmentCount?: number
  },
): LedgerRow {
  const { category, vehicle, createdAt, attachmentCount = 0 } = context

  return {
    id: write.id,
    occurred_on: write.occurred_on,
    amount: write.amount,
    currency: write.currency,
    category_id: write.category_id,
    category_name: category?.name ?? null,
    category_icon: category?.icon ?? null,
    category_colour_hex: category?.colour_hex ?? null,
    vehicle_id: write.vehicle_id,
    vehicle_nickname: vehicle?.nickname ?? null,
    bucket: write.bucket,
    counts_toward_budget: write.counts_toward_budget,
    amortize_months: write.amortize_months,
    merchant: write.merchant,
    note: write.note,
    odometer_km: write.odometer_km,
    is_draft: false,
    attachment_count: attachmentCount,
    created_at: createdAt,
    day_total: 0,
    day_count: 0,
  }
}

/**
 * The write that would recreate a row exactly as it is. Used by undo, which puts
 * a deleted expense back under its original id so anything that referenced it
 * still does.
 */
export function writeFromLedgerRow(row: LedgerRow): ExpenseWrite {
  return {
    id: row.id,
    occurred_on: row.occurred_on,
    amount: row.amount,
    currency: row.currency,
    category_id: row.category_id,
    vehicle_id: row.vehicle_id,
    bucket: row.bucket,
    counts_toward_budget: row.counts_toward_budget,
    amortize_months: row.amortize_months,
    merchant: row.merchant,
    note: row.note,
    odometer_km: row.odometer_km,
  }
}
