import { describe, expect, it } from 'vitest'

import { EMPTY_FILTERS, type LedgerFilters } from '@/lib/expenses/filters'
import {
  applyPending,
  buildLedgerItems,
  pendingMonthDelta,
  type PendingOp,
} from '@/lib/expenses/optimistic'
import type { LedgerRow } from '@/lib/expenses/types'

function row(overrides: Partial<LedgerRow> & Pick<LedgerRow, 'id'>): LedgerRow {
  return {
    occurred_on: '2026-08-20',
    amount: 100_000,
    currency: 'VND',
    category_id: null,
    category_name: null,
    category_icon: null,
    category_colour_hex: null,
    vehicle_id: null,
    vehicle_nickname: null,
    bucket: 'life',
    counts_toward_budget: true,
    amortize_months: 1,
    merchant: null,
    note: null,
    odometer_km: null,
    is_draft: false,
    attachment_count: 0,
    created_at: '2026-08-20T10:00:00.000Z',
    day_total: 100_000,
    day_count: 1,
    ...overrides,
  }
}

describe('applyPending', () => {
  it('leaves the page alone when nothing is in flight', () => {
    const server = [row({ id: 'a' })]
    const result = applyPending(server, [], EMPTY_FILTERS)
    expect(result.rows).toHaveLength(1)
    expect(result.rows[0]?.pending).toBe(false)
    expect(result.dayDelta.size).toBe(0)
  })

  it('adds a pending create to its day and moves the day subtotal', () => {
    const server = [row({ id: 'a', amount: 100_000, day_total: 100_000 })]
    const created = row({
      id: 'b',
      amount: 40_000,
      created_at: '2026-08-20T11:00:00.000Z',
      day_total: 0,
      day_count: 0,
    })

    const result = applyPending(server, [{ kind: 'save', row: created, previous: null }], EMPTY_FILTERS)

    expect(result.rows.map((r) => r.id)).toEqual(['b', 'a'])
    expect(result.rows[0]?.pending).toBe(true)
    // The new row inherits the day figures SQL gave for that day.
    expect(result.rows[0]?.day_total).toBe(100_000)
    expect(result.dayDelta.get('2026-08-20')).toBe(40_000)

    const [heading] = buildLedgerItems(result)
    expect(heading).toMatchObject({ kind: 'day', date: '2026-08-20', total: 140_000 })
  })

  it('starts a day that was not on screen from the pending row alone', () => {
    const server = [row({ id: 'a', occurred_on: '2026-08-19', day_total: 100_000 })]
    const created = row({
      id: 'b',
      occurred_on: '2026-08-21',
      amount: 55_000,
      created_at: '2026-08-21T09:00:00.000Z',
      day_total: 0,
      day_count: 0,
    })

    const items = buildLedgerItems(
      applyPending(server, [{ kind: 'save', row: created, previous: null }], EMPTY_FILTERS),
    )

    expect(items[0]).toMatchObject({ kind: 'day', date: '2026-08-21', total: 55_000 })
    expect(items[2]).toMatchObject({ kind: 'day', date: '2026-08-19', total: 100_000 })
  })

  it('moves the subtotal by the difference when an amount is edited', () => {
    const before = row({ id: 'a', amount: 100_000, day_total: 250_000, day_count: 2 })
    const after = { ...before, amount: 120_000 }

    const result = applyPending(
      [before, row({ id: 'z', amount: 150_000, day_total: 250_000, day_count: 2 })],
      [{ kind: 'save', row: after, previous: before }],
      EMPTY_FILTERS,
    )

    expect(result.dayDelta.get('2026-08-20')).toBe(20_000)
    const [heading] = buildLedgerItems(result)
    expect(heading).toMatchObject({ total: 270_000 })
  })

  it('takes the row off both days when an edit changes the date', () => {
    const before = row({ id: 'a', occurred_on: '2026-08-20', amount: 100_000 })
    const after = { ...before, occurred_on: '2026-08-18' }

    const result = applyPending([before], [{ kind: 'save', row: after, previous: before }], EMPTY_FILTERS)

    expect(result.dayDelta.get('2026-08-20')).toBe(-100_000)
    expect(result.dayDelta.get('2026-08-18')).toBe(100_000)
    expect(result.rows[0]?.occurred_on).toBe('2026-08-18')
  })

  it('removes a deleted row and subtracts it from the day', () => {
    const doomed = row({ id: 'a', amount: 100_000, day_total: 250_000, day_count: 2 })
    const survivor = row({ id: 'b', amount: 150_000, day_total: 250_000, day_count: 2 })

    const result = applyPending([doomed, survivor], [{ kind: 'delete', row: doomed }], EMPTY_FILTERS)

    expect(result.rows.map((r) => r.id)).toEqual(['b'])
    const [heading] = buildLedgerItems(result)
    expect(heading).toMatchObject({ total: 150_000 })
  })

  it('drops a pending create that the active filter excludes', () => {
    const filters: LedgerFilters = { ...EMPTY_FILTERS, buckets: ['car_project'] }
    const created = row({ id: 'b', bucket: 'life', day_total: 0, day_count: 0 })

    const result = applyPending([], [{ kind: 'save', row: created, previous: null }], filters)

    expect(result.rows).toHaveLength(0)
    expect(result.dayDelta.size).toBe(0)
  })

  it('takes a row off screen when an edit pushes it outside the filter', () => {
    const filters: LedgerFilters = { ...EMPTY_FILTERS, search: 'shell' }
    const before = row({ id: 'a', merchant: 'Shell', amount: 100_000 })
    const after = { ...before, merchant: 'Petrolimex' }

    const result = applyPending([before], [{ kind: 'save', row: after, previous: before }], filters)

    expect(result.rows).toHaveLength(0)
    expect(result.dayDelta.get('2026-08-20')).toBe(-100_000)
  })
})

describe('pendingMonthDelta', () => {
  const august = '2026-08-01'

  it('adds the whole amount of an unspread expense', () => {
    const ops: PendingOp[] = [{ kind: 'save', row: row({ id: 'a', amount: 150_000 }), previous: null }]
    expect(pendingMonthDelta(ops, august, 'VND')).toBe(150_000)
  })

  it('adds only this month of a spread expense, remainder on the first slice', () => {
    const spread = row({ id: 'a', amount: 100, amortize_months: 3, occurred_on: '2026-08-20' })
    const ops: PendingOp[] = [{ kind: 'save', row: spread, previous: null }]

    expect(pendingMonthDelta(ops, '2026-08-01', 'VND')).toBe(34)
    expect(pendingMonthDelta(ops, '2026-09-01', 'VND')).toBe(33)
    expect(pendingMonthDelta(ops, '2026-10-01', 'VND')).toBe(33)
    expect(pendingMonthDelta(ops, '2026-11-01', 'VND')).toBe(0)
  })

  it('ignores an expense kept out of the budget', () => {
    const kept = row({ id: 'a', amount: 24_000_000, counts_toward_budget: false })
    expect(pendingMonthDelta([{ kind: 'save', row: kept, previous: null }], august, 'VND')).toBe(0)
  })

  it('ignores a draft', () => {
    const draft = row({ id: 'a', amount: 500_000, is_draft: true })
    expect(pendingMonthDelta([{ kind: 'save', row: draft, previous: null }], august, 'VND')).toBe(0)
  })

  it('nets an edit against what the row used to be', () => {
    const before = row({ id: 'a', amount: 100_000 })
    const after = { ...before, amount: 60_000 }
    expect(pendingMonthDelta([{ kind: 'save', row: after, previous: before }], august, 'VND')).toBe(-40_000)
  })

  it('removes the whole impact of a deleted row', () => {
    const doomed = row({ id: 'a', amount: 100_000 })
    expect(pendingMonthDelta([{ kind: 'delete', row: doomed }], august, 'VND')).toBe(-100_000)
  })

  it('never mixes currencies', () => {
    const usd = row({ id: 'a', amount: 5_000, currency: 'USD' })
    expect(pendingMonthDelta([{ kind: 'save', row: usd, previous: null }], august, 'VND')).toBe(0)
    expect(pendingMonthDelta([{ kind: 'save', row: usd, previous: null }], august, 'USD')).toBe(5_000)
  })

  it('turning the budget switch off pulls the amount back out of the month', () => {
    const before = row({ id: 'a', amount: 900_000, counts_toward_budget: true })
    const after = { ...before, counts_toward_budget: false }
    expect(pendingMonthDelta([{ kind: 'save', row: after, previous: before }], august, 'VND')).toBe(-900_000)
  })
})
