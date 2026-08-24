import { describe, expect, it } from 'vitest'

import { categoryWriteSchema, expenseWriteSchema } from '@/lib/expenses/schema'

const ID = '11111111-2222-4333-8444-555555555555'
const VEHICLE = 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee'

function expense(overrides: Record<string, unknown> = {}) {
  return {
    id: ID,
    occurred_on: '2026-08-25',
    amount: 150_000,
    currency: 'vnd',
    category_id: null,
    vehicle_id: null,
    bucket: 'life',
    counts_toward_budget: true,
    amortize_months: 1,
    merchant: '  Petrolimex  ',
    note: '',
    odometer_km: null,
    ...overrides,
  }
}

/**
 * This schema is the only gate on an expense write now that the form hands the
 * server a plain object, so it is worth being explicit about what it lets past.
 */
describe('expenseWriteSchema', () => {
  it('trims text, empties to null, and upper-cases the currency', () => {
    const parsed = expenseWriteSchema.parse(expense())
    expect(parsed.merchant).toBe('Petrolimex')
    expect(parsed.note).toBe(null)
    expect(parsed.currency).toBe('VND')
  })

  it('accepts a negative amount, because a refund is an expense', () => {
    expect(expenseWriteSchema.parse(expense({ amount: -250_000 })).amount).toBe(-250_000)
  })

  it('rejects nothing at all', () => {
    expect(expenseWriteSchema.safeParse(expense({ amount: 0 })).success).toBe(false)
  })

  it('rejects a fractional amount: money is integer minor units', () => {
    expect(expenseWriteSchema.safeParse(expense({ amount: 150_000.5 })).success).toBe(false)
  })

  it('holds the bucket and vehicle invariant in both directions', () => {
    expect(
      expenseWriteSchema.safeParse(expense({ bucket: 'car_running', vehicle_id: null })).success,
    ).toBe(false)
    expect(
      expenseWriteSchema.safeParse(expense({ bucket: 'life', vehicle_id: VEHICLE })).success,
    ).toBe(false)
    expect(
      expenseWriteSchema.safeParse(expense({ bucket: 'car_project', vehicle_id: VEHICLE })).success,
    ).toBe(true)
  })

  it('will not take an odometer reading with no vehicle to attach it to', () => {
    expect(expenseWriteSchema.safeParse(expense({ odometer_km: 41_000 })).success).toBe(false)
  })

  it('keeps amortize_months inside the range the check constraint allows', () => {
    expect(expenseWriteSchema.safeParse(expense({ amortize_months: 0 })).success).toBe(false)
    expect(expenseWriteSchema.safeParse(expense({ amortize_months: 121 })).success).toBe(false)
    expect(expenseWriteSchema.safeParse(expense({ amortize_months: 120 })).success).toBe(true)
  })

  it('rejects a date that is not a date', () => {
    expect(expenseWriteSchema.safeParse(expense({ occurred_on: '2026-13-01' })).success).toBe(false)
    expect(expenseWriteSchema.safeParse(expense({ occurred_on: '25/08/2026' })).success).toBe(false)
  })

  it('reads an empty id string as absent rather than as an id', () => {
    expect(expenseWriteSchema.parse(expense({ category_id: '' })).category_id).toBe(null)
  })
})

describe('categoryWriteSchema', () => {
  const category = {
    id: ID,
    name: '  Track days  ',
    icon: 'Flag',
    colour_hex: '#a95031',
    default_bucket: 'car_project',
    default_counts_toward_budget: false,
    sort_order: null,
  }

  it('trims the name and normalises the colour', () => {
    const parsed = categoryWriteSchema.parse(category)
    expect(parsed.name).toBe('Track days')
    expect(parsed.colour_hex).toBe('#A95031')
  })

  it('insists on a name and on a six-digit hex', () => {
    expect(categoryWriteSchema.safeParse({ ...category, name: '   ' }).success).toBe(false)
    expect(categoryWriteSchema.safeParse({ ...category, colour_hex: 'brick' }).success).toBe(false)
    expect(categoryWriteSchema.safeParse({ ...category, colour_hex: '#abc' }).success).toBe(false)
  })
})
