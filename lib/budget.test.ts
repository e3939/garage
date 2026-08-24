import { describe, expect, it } from 'vitest'

import {
  CAR_BUCKETS,
  DEFAULT_BUDGET_POLICY,
  amortiseSlices,
  impactInMonth,
  isCarBucket,
  resolveBucket,
  resolveCountsTowardBudget,
} from '@/lib/budget'
import { sumMinor } from '@/lib/money'

const fuel = { default_bucket: 'car_running', default_counts_toward_budget: true } as const
const mods = { default_bucket: 'car_project', default_counts_toward_budget: false } as const
const groceries = { default_bucket: 'life', default_counts_toward_budget: true } as const

describe('resolveBucket', () => {
  it('takes the expense override before anything else', () => {
    expect(resolveBucket({ override: 'car_project', category: fuel, hasVehicle: true })).toBe('car_project')
  })

  it('falls back to the category default', () => {
    expect(resolveBucket({ category: fuel, hasVehicle: true })).toBe('car_running')
    expect(resolveBucket({ category: mods, hasVehicle: true })).toBe('car_project')
    expect(resolveBucket({ category: groceries, hasVehicle: false })).toBe('life')
  })

  it('falls back to the vehicle when there is no category', () => {
    expect(resolveBucket({ hasVehicle: true })).toBe('car_running')
    expect(resolveBucket({ hasVehicle: false })).toBe('life')
  })

  it('stays consistent with the vehicle, because the database insists', () => {
    // A car bucket with no car is not a row the database will accept.
    expect(resolveBucket({ override: 'car_project', hasVehicle: false })).toBe('life')
    expect(resolveBucket({ category: mods, hasVehicle: false })).toBe('life')
    // Neither is life spend with a car attached to it.
    expect(resolveBucket({ override: 'life', hasVehicle: true })).toBe('car_running')
    expect(resolveBucket({ category: groceries, hasVehicle: true })).toBe('car_running')
  })

  it('treats a null override as absent', () => {
    expect(resolveBucket({ override: null, category: mods, hasVehicle: true })).toBe('car_project')
  })

  it('knows which buckets are car buckets', () => {
    expect(CAR_BUCKETS).toEqual(['car_running', 'car_project'])
    expect(isCarBucket('car_running')).toBe(true)
    expect(isCarBucket('car_project')).toBe(true)
    expect(isCarBucket('life')).toBe(false)
  })
})

describe('resolveCountsTowardBudget', () => {
  it('takes the expense override before anything else', () => {
    expect(resolveCountsTowardBudget({ override: true, category: mods, bucket: 'car_project' })).toBe(true)
    expect(resolveCountsTowardBudget({ override: false, category: fuel, bucket: 'car_running' })).toBe(false)
  })

  it('falls back to the category default', () => {
    expect(resolveCountsTowardBudget({ category: fuel, bucket: 'car_running' })).toBe(true)
    expect(resolveCountsTowardBudget({ category: mods, bucket: 'car_project' })).toBe(false)
  })

  it('falls back to the bucket policy when there is no category', () => {
    expect(resolveCountsTowardBudget({ bucket: 'life' })).toBe(true)
    expect(resolveCountsTowardBudget({ bucket: 'car_running' })).toBe(true)
    expect(resolveCountsTowardBudget({ bucket: 'car_project' })).toBe(false)
    expect(DEFAULT_BUDGET_POLICY).toEqual({ life: true, car_running: true, car_project: false })
  })

  it('accepts a policy from settings', () => {
    const strict = { life: true, car_running: true, car_project: true } as const
    expect(resolveCountsTowardBudget({ bucket: 'car_project', policy: strict })).toBe(true)
  })

  it('treats a null override as absent', () => {
    expect(resolveCountsTowardBudget({ override: null, category: mods, bucket: 'car_project' })).toBe(false)
  })
})

describe('amortiseSlices', () => {
  it('puts the remainder on the first slice: 100 over 3 is 34, 33, 33', () => {
    expect(
      amortiseSlices({
        amount: 100,
        occurred_on: '2026-08-25',
        amortize_months: 3,
        counts_toward_budget: true,
      }),
    ).toEqual([
      { impact_month: '2026-08-01', amount: 34 },
      { impact_month: '2026-09-01', amount: 33 },
      { impact_month: '2026-10-01', amount: 33 },
    ])
  })

  it('spreads 1 over 12 months as a single unit in the first month', () => {
    const slices = amortiseSlices({
      amount: 1,
      occurred_on: '2026-08-25',
      amortize_months: 12,
      counts_toward_budget: true,
    })

    expect(slices).toHaveLength(12)
    expect(slices[0]).toEqual({ impact_month: '2026-08-01', amount: 1 })
    expect(slices.slice(1).every((slice) => slice.amount === 0)).toBe(true)
    expect(slices.at(-1)?.impact_month).toBe('2027-07-01')
    expect(sumMinor(slices.map((slice) => slice.amount))).toBe(1)
  })

  it('mirrors the rule for a refund', () => {
    expect(
      amortiseSlices({
        amount: -100,
        occurred_on: '2026-08-25',
        amortize_months: 3,
        counts_toward_budget: true,
      }),
    ).toEqual([
      { impact_month: '2026-08-01', amount: -34 },
      { impact_month: '2026-09-01', amount: -33 },
      { impact_month: '2026-10-01', amount: -33 },
    ])

    const twelve = amortiseSlices({
      amount: -1,
      occurred_on: '2026-12-15',
      amortize_months: 12,
      counts_toward_budget: true,
    })
    expect(twelve[0]).toEqual({ impact_month: '2026-12-01', amount: -1 })
    expect(sumMinor(twelve.map((slice) => slice.amount))).toBe(-1)
  })

  it('is a single slice on the expense month by default', () => {
    expect(
      amortiseSlices({
        amount: 150_000,
        occurred_on: '2026-02-28',
        amortize_months: 1,
        counts_toward_budget: true,
      }),
    ).toEqual([{ impact_month: '2026-02-01', amount: 150_000 }])
  })

  it('rolls over the year end', () => {
    const slices = amortiseSlices({
      amount: 24_000_000,
      occurred_on: '2026-11-03',
      amortize_months: 24,
      counts_toward_budget: true,
    })
    expect(slices).toHaveLength(24)
    expect(slices[0]?.impact_month).toBe('2026-11-01')
    expect(slices[2]?.impact_month).toBe('2027-01-01')
    expect(slices.at(-1)?.impact_month).toBe('2028-10-01')
    expect(slices.every((slice) => slice.amount === 1_000_000)).toBe(true)
  })

  it('always sums back to the full amount', () => {
    for (const amount of [1, -1, 100, -100, 7, 24_000_001, -24_000_001]) {
      for (const months of [1, 2, 3, 5, 12, 24, 120]) {
        const slices = amortiseSlices({
          amount,
          occurred_on: '2026-08-25',
          amortize_months: months,
          counts_toward_budget: true,
        })
        expect(sumMinor(slices.map((slice) => slice.amount))).toBe(amount)
      }
    }
  })

  it('produces nothing for an expense that is already out of the monthly picture', () => {
    expect(
      amortiseSlices({
        amount: 24_000_000,
        occurred_on: '2026-08-25',
        amortize_months: 24,
        counts_toward_budget: false,
      }),
    ).toEqual([])
  })

  it('produces nothing for a draft awaiting confirmation', () => {
    expect(
      amortiseSlices({
        amount: 150_000,
        occurred_on: '2026-08-25',
        amortize_months: 1,
        counts_toward_budget: true,
        is_draft: true,
      }),
    ).toEqual([])
  })

  it('refuses a spread the database would refuse', () => {
    const base = { amount: 100, occurred_on: '2026-08-25', counts_toward_budget: true }
    expect(() => amortiseSlices({ ...base, amortize_months: 0 })).toThrow(RangeError)
    expect(() => amortiseSlices({ ...base, amortize_months: 121 })).toThrow(RangeError)
    expect(() => amortiseSlices({ ...base, amortize_months: 1.5 })).toThrow(RangeError)
  })

  it('refuses a date that is not a plain ISO day', () => {
    expect(() =>
      amortiseSlices({
        amount: 100,
        occurred_on: '2026-08-25T00:00:00Z',
        amortize_months: 1,
        counts_toward_budget: true,
      }),
    ).toThrow(RangeError)
  })
})

describe('impactInMonth', () => {
  const tyres = {
    amount: 24_000_000,
    occurred_on: '2026-08-25',
    amortize_months: 24,
    counts_toward_budget: true,
  }

  it('returns the slice landing in that month', () => {
    expect(impactInMonth(tyres, '2026-08-01')).toBe(1_000_000)
    expect(impactInMonth(tyres, '2027-08-15')).toBe(1_000_000)
    expect(impactInMonth(tyres, '2028-07-01')).toBe(1_000_000)
  })

  it('returns zero outside the spread', () => {
    expect(impactInMonth(tyres, '2026-07-01')).toBe(0)
    expect(impactInMonth(tyres, '2028-08-01')).toBe(0)
  })
})
