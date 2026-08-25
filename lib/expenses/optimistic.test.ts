import { describe, expect, it } from 'vitest'

import { EMPTY_FILTERS, type LedgerFilters } from '@/lib/expenses/filters'
import {
  applyPending,
  buildLedgerItems,
  contributionInMonth,
  pendingMonthDelta,
  pendingVehicleMonthDelta,
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

/**
 * The three views, on the client.
 *
 * These figures are computed by `v_month_totals` and mirrored here only so a
 * write can be seen before the server answers. The numbers below are the same
 * ones `lib/queries/vehicles.db.test.ts` asserts against Postgres, on purpose:
 * if the two ever disagree, the view is right and this is the bug.
 */
describe('the three views', () => {
  const august = '2026-08-01'

  const groceries = row({ id: 'g', amount: 150_000, bucket: 'life', counts_toward_budget: true })
  const fuel = row({
    id: 'f',
    amount: 850_000,
    bucket: 'car_running',
    vehicle_id: 'car',
    counts_toward_budget: true,
  })
  const mods = row({
    id: 'm',
    amount: 24_000_000,
    bucket: 'car_project',
    vehicle_id: 'car',
    counts_toward_budget: false,
  })
  const tyres = row({
    id: 't',
    amount: 12_000_000,
    bucket: 'car_running',
    vehicle_id: 'car',
    counts_toward_budget: true,
    amortize_months: 12,
  })

  const all = [groceries, fuel, mods, tyres]
  const sum = (view: 'monthly' | 'all_in' | 'car_only', month = august) =>
    all.reduce((total, entry) => total + contributionInMonth(entry, month, view), 0)

  it('produces three different figures from one set of expenses', () => {
    expect(sum('monthly')).toBe(2_000_000)
    expect(sum('all_in')).toBe(37_000_000)
    expect(sum('car_only')).toBe(36_850_000)
    expect(new Set([sum('monthly'), sum('all_in'), sum('car_only')]).size).toBe(3)
  })

  it('amortises the budget view and nothing else', () => {
    const september = '2026-09-01'
    expect(sum('monthly', september)).toBe(1_000_000)
    expect(sum('all_in', september)).toBe(0)
    expect(sum('car_only', september)).toBe(0)
  })

  it('keeps a kept-out expense out of the budget view only', () => {
    expect(contributionInMonth(mods, august, 'monthly')).toBe(0)
    expect(contributionInMonth(mods, august, 'all_in')).toBe(24_000_000)
    expect(contributionInMonth(mods, august, 'car_only')).toBe(24_000_000)
  })

  it('keeps life spend out of the car-only view only', () => {
    expect(contributionInMonth(groceries, august, 'monthly')).toBe(150_000)
    expect(contributionInMonth(groceries, august, 'all_in')).toBe(150_000)
    expect(contributionInMonth(groceries, august, 'car_only')).toBe(0)
  })

  it('ignores a draft in every view', () => {
    const draft = row({ id: 'd', amount: 500_000, is_draft: true, counts_toward_budget: true })
    expect(contributionInMonth(draft, august, 'monthly')).toBe(0)
    expect(contributionInMonth(draft, august, 'all_in')).toBe(0)
    expect(contributionInMonth(draft, august, 'car_only')).toBe(0)
  })

  it('moves the pending delta by the view on screen', () => {
    const ops: PendingOp[] = [{ kind: 'save', row: mods, previous: null }]
    expect(pendingMonthDelta(ops, august, 'VND', 'monthly')).toBe(0)
    expect(pendingMonthDelta(ops, august, 'VND', 'all_in')).toBe(24_000_000)
    expect(pendingMonthDelta(ops, august, 'VND', 'car_only')).toBe(24_000_000)
  })

  it('defaults to the budget view, which is what /today opened on before', () => {
    const ops: PendingOp[] = [{ kind: 'save', row: mods, previous: null }]
    expect(pendingMonthDelta(ops, august, 'VND')).toBe(
      pendingMonthDelta(ops, august, 'VND', 'monthly'),
    )
  })
})

describe('pendingVehicleMonthDelta', () => {
  const august = '2026-08-01'

  const onCar = row({
    id: 'f',
    amount: 850_000,
    bucket: 'car_running',
    vehicle_id: 'car',
    counts_toward_budget: true,
  })
  const onOtherCar = { ...onCar, id: 'o', vehicle_id: 'other' }
  const life = row({ id: 'g', amount: 150_000, bucket: 'life', counts_toward_budget: true })

  it('counts only the vehicle asked about', () => {
    const ops: PendingOp[] = [
      { kind: 'save', row: onCar, previous: null },
      { kind: 'save', row: onOtherCar, previous: null },
      { kind: 'save', row: life, previous: null },
    ]
    expect(pendingVehicleMonthDelta(ops, 'car', august, 'VND', 'all_in')).toBe(850_000)
    expect(pendingVehicleMonthDelta(ops, 'other', august, 'VND', 'all_in')).toBe(850_000)
  })

  it('takes the amount off the car it moved away from', () => {
    const moved = { ...onCar, vehicle_id: 'other' }
    const ops: PendingOp[] = [{ kind: 'save', row: moved, previous: onCar }]
    expect(pendingVehicleMonthDelta(ops, 'car', august, 'VND', 'all_in')).toBe(-850_000)
    expect(pendingVehicleMonthDelta(ops, 'other', august, 'VND', 'all_in')).toBe(850_000)
  })

  it('removes a deleted row from its own car', () => {
    const ops: PendingOp[] = [{ kind: 'delete', row: onCar }]
    expect(pendingVehicleMonthDelta(ops, 'car', august, 'VND', 'monthly')).toBe(-850_000)
  })
})
