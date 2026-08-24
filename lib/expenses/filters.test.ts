import { describe, expect, it } from 'vitest'

import {
  activeFilterCount,
  EMPTY_FILTERS,
  filtersToSearchParams,
  isEmptyFilters,
  parseFilters,
  type LedgerFilters,
} from '@/lib/expenses/filters'

const UUID_A = '11111111-2222-4333-8444-555555555555'
const UUID_B = 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee'

describe('parseFilters', () => {
  it('reads nothing out of nothing', () => {
    expect(parseFilters({})).toEqual(EMPTY_FILTERS)
    expect(isEmptyFilters(parseFilters({}))).toBe(true)
  })

  it('reads every filter the ledger offers', () => {
    const filters = parseFilters({
      from: '2026-08-01',
      to: '2026-08-31',
      cat: `${UUID_A},${UUID_B}`,
      bucket: 'car_project,life',
      veh: UUID_A,
      photo: 'yes',
      min: '100000',
      max: '5000000',
      q: '  coilovers  ',
    })

    expect(filters).toEqual({
      from: '2026-08-01',
      to: '2026-08-31',
      categoryIds: [UUID_A, UUID_B],
      buckets: ['car_project', 'life'],
      vehicleIds: [UUID_A],
      hasPhoto: true,
      amountMin: 100_000,
      amountMax: 5_000_000,
      search: 'coilovers',
    })
  })

  it('drops anything it cannot read rather than failing the page', () => {
    const filters = parseFilters({
      from: 'last tuesday',
      cat: 'not-a-uuid',
      bucket: 'boat',
      photo: 'perhaps',
      min: '1e400',
      max: 'lots',
    })
    expect(filters).toEqual(EMPTY_FILTERS)
  })

  it('reads photo=no as "without", not as "do not care"', () => {
    expect(parseFilters({ photo: 'no' }).hasPhoto).toBe(false)
    expect(parseFilters({ photo: '' }).hasPhoto).toBe(null)
  })

  it('round-trips through the query string', () => {
    const filters: LedgerFilters = {
      from: '2026-01-01',
      to: null,
      categoryIds: [UUID_A],
      buckets: ['car_running'],
      vehicleIds: [],
      hasPhoto: false,
      amountMin: null,
      amountMax: -50_000,
      search: 'refund',
    }
    const params = filtersToSearchParams(filters)
    expect(parseFilters(Object.fromEntries(params))).toEqual(filters)
  })

  it('leaves no trace of a cleared filter', () => {
    expect(filtersToSearchParams(EMPTY_FILTERS).toString()).toBe('')
  })
})

describe('activeFilterCount', () => {
  it('counts a date range once, however many ends it has', () => {
    expect(activeFilterCount({ ...EMPTY_FILTERS, from: '2026-08-01' })).toBe(1)
    expect(activeFilterCount({ ...EMPTY_FILTERS, from: '2026-08-01', to: '2026-08-31' })).toBe(1)
  })

  it('counts an amount range once and a search once', () => {
    expect(
      activeFilterCount({ ...EMPTY_FILTERS, amountMin: 1, amountMax: 2, search: 'x' }),
    ).toBe(2)
  })
})
