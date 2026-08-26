/**
 * The dry run, tested against the promises the screen makes about it.
 *
 * Two of these matter more than the rest: a row that cannot be read is skipped
 * rather than fatal, and a file this app exported imports twice with the same
 * result as importing it once. Everything else in the phase rests on those two.
 */

import { describe, expect, it } from 'vitest'

import { parseCsv } from '@/lib/csv/parse'
import { autoMap, normaliseHeader } from '@/lib/import/fields'
import {
  idsInFile,
  parseImportAmount,
  parseImportBoolean,
  parseImportBucket,
  parseImportDate,
  planImport,
  readyExpenses,
} from '@/lib/import/rows'
import type { ImportContext } from '@/lib/import/types'

const CONTEXT: ImportContext = {
  categories: [
    { id: 'c1', name: 'Fuel', default_bucket: 'car_running', default_counts_toward_budget: true },
    { id: 'c2', name: 'Mods & Parts', default_bucket: 'car_project', default_counts_toward_budget: false },
    { id: 'c3', name: 'Groceries', default_bucket: 'life', default_counts_toward_budget: true },
  ],
  vehicles: [{ id: 'v1', nickname: 'The Civic' }],
  currency: 'VND',
}

/** Deterministic ids, so a plan can be compared without stubbing the platform. */
function ids() {
  let next = 0
  return () => {
    next += 1
    return `00000000-0000-4000-8000-${String(next).padStart(12, '0')}`
  }
}

function plan(csv: string, context: ImportContext = CONTEXT) {
  const table = parseCsv(csv)
  return planImport(table, autoMap(table.header), context, ids())
}

describe('parseImportDate', () => {
  it('reads ISO', () => {
    expect(parseImportDate('2026-08-26')).toBe('2026-08-26')
    expect(parseImportDate('2026/8/6')).toBe('2026-08-06')
  })

  it('reads day-first, which is what this app`s locale writes', () => {
    expect(parseImportDate('26/08/2026')).toBe('2026-08-26')
    expect(parseImportDate('1.2.2026')).toBe('2026-02-01')
    expect(parseImportDate('26-08-26')).toBe('2026-08-26')
  })

  it('throws away a time', () => {
    expect(parseImportDate('2026-08-26T09:15:00Z')).toBe('2026-08-26')
    expect(parseImportDate('26/08/2026 09:15')).toBe('2026-08-26')
  })

  it('refuses a date that does not exist', () => {
    expect(parseImportDate('2026-02-30')).toBe(null)
    expect(parseImportDate('31/02/2026')).toBe(null)
    expect(parseImportDate('2025-02-29')).toBe(null)
    expect(parseImportDate('2024-02-29')).toBe('2024-02-29')
  })

  it('refuses anything that is not a date at all', () => {
    expect(parseImportDate('last tuesday')).toBe(null)
    expect(parseImportDate('')).toBe(null)
  })
})

describe('parseImportAmount', () => {
  it('reads what the amount field reads', () => {
    expect(parseImportAmount('150000', 'VND')).toBe(150000)
    expect(parseImportAmount('150.000', 'VND')).toBe(150000)
    expect(parseImportAmount('150k', 'VND')).toBe(150000)
    expect(parseImportAmount('1.2m', 'VND')).toBe(1200000)
    expect(parseImportAmount('150.000 ₫', 'VND')).toBe(150000)
  })

  it('reads a refund three ways', () => {
    expect(parseImportAmount('-150000', 'VND')).toBe(-150000)
    expect(parseImportAmount('(150.000)', 'VND')).toBe(-150000)
    expect(parseImportAmount('150000-', 'VND')).toBe(-150000)
  })

  it('respects the currency`s decimal places', () => {
    expect(parseImportAmount('12.34', 'USD')).toBe(1234)
    expect(parseImportAmount('12.34', 'VND')).toBe(null)
  })
})

describe('parseImportBoolean and parseImportBucket', () => {
  it('reads yes and no in both languages', () => {
    expect(parseImportBoolean('yes')).toBe(true)
    expect(parseImportBoolean('Có')).toBe(true)
    expect(parseImportBoolean('0')).toBe(false)
    expect(parseImportBoolean('Không')).toBe(false)
    expect(parseImportBoolean('maybe')).toBe(null)
  })

  it('reads a bucket by its stored name or its label', () => {
    expect(parseImportBucket('car_running')).toBe('car_running')
    expect(parseImportBucket('Running')).toBe('car_running')
    expect(parseImportBucket('Life')).toBe('life')
    expect(parseImportBucket('Project')).toBe('car_project')
    expect(parseImportBucket('petrol')).toBe(null)
  })
})

describe('autoMap', () => {
  it('maps a file this app exported with nothing to do', () => {
    const header = [
      'id',
      'occurred_on',
      'amount',
      'currency',
      'category',
      'vehicle',
      'bucket',
      'counts_toward_budget',
      'amortize_months',
      'merchant',
      'note',
      'odometer_km',
    ]
    expect(autoMap(header)).toEqual({
      id: 0,
      occurred_on: 1,
      amount: 2,
      currency: 3,
      category: 4,
      vehicle: 5,
      bucket: 6,
      counts_toward_budget: 7,
      amortize_months: 8,
      merchant: 9,
      note: 10,
      odometer_km: 11,
    })
  })

  it('maps a Vietnamese header', () => {
    expect(autoMap(['Ngày', 'Số tiền', 'Danh mục', 'Ghi chú'])).toEqual({
      occurred_on: 0,
      amount: 1,
      category: 2,
      note: 3,
    })
  })

  it('leaves a column it does not recognise unmapped', () => {
    expect(autoMap(['date', 'amount', 'reference'])).toEqual({ occurred_on: 0, amount: 1 })
  })

  it('normalises accents, case and punctuation', () => {
    expect(normaliseHeader('Số tiền')).toBe('sotien')
    expect(normaliseHeader('COUNTS_TOWARD_BUDGET')).toBe('countstowardbudget')
  })
})

describe('planImport', () => {
  it('reads a plain file', () => {
    const result = plan('date,amount,category\n2026-08-26,150.000,Fuel\n')
    expect(result.ready).toBe(1)
    expect(result.skipped).toBe(0)

    const [expense] = readyExpenses(result)
    expect(expense?.occurred_on).toBe('2026-08-26')
    expect(expense?.amount).toBe(150000)
    expect(expense?.category_id).toBe('c1')
    // The category decides the bucket and the budget switch when the file does not.
    expect(expense?.bucket).toBe('life')
    expect(expense?.counts_toward_budget).toBe(true)
  })

  it('puts a car bucket on a row that names a car, and only then', () => {
    const result = plan(
      'date,amount,category,vehicle\n2026-08-26,150000,Fuel,The Civic\n2026-08-27,90000,Fuel,\n',
    )
    const [withCar, withoutCar] = readyExpenses(result)
    expect(withCar?.vehicle_id).toBe('v1')
    expect(withCar?.bucket).toBe('car_running')
    // The category's own default is a car bucket, but there is no car on this
    // row, so it lands as life spend rather than failing the check constraint.
    expect(withoutCar?.vehicle_id).toBe(null)
    expect(withoutCar?.bucket).toBe('life')
  })

  it('skips a bad row and imports the rest', () => {
    const result = plan(
      [
        'date,amount,category',
        '2026-08-26,150000,Fuel',
        'last tuesday,150000,Fuel',
        '2026-08-28,,Fuel',
        '2026-08-29,0,Fuel',
        '2026-08-30,90000,Fuel',
      ].join('\n'),
    )

    expect(result.ready).toBe(2)
    expect(result.skipped).toBe(3)
    expect(result.reasons.map((reason) => reason.reason)).toContain('No amount')
    expect(result.reasons.map((reason) => reason.reason)).toContain('Amount is zero')
    expect(result.rows[1]?.errors[0]).toBe('"last tuesday" is not a date')
  })

  it('names a vehicle it has not got rather than inventing one', () => {
    const result = plan('date,amount,vehicle\n2026-08-26,150000,The Cub\n')
    expect(result.ready).toBe(0)
    expect(result.rows[0]?.errors[0]).toBe('No vehicle called "The Cub"')
  })

  it('creates a category the file names, once, and only for a row that imports', () => {
    const result = plan(
      [
        'date,amount,category',
        '2026-08-26,150000,Car wash',
        '2026-08-27,90000,Car wash',
        'not a date,90000,Never used',
      ].join('\n'),
    )

    expect(result.newCategories).toHaveLength(1)
    expect(result.newCategories[0]?.name).toBe('Car wash')
    // Both rows point at the same new category.
    const [first, second] = readyExpenses(result)
    expect(first?.category_id).toBe(result.newCategories[0]?.id)
    expect(second?.category_id).toBe(result.newCategories[0]?.id)
  })

  it('matches a category through case and accents', () => {
    const result = plan('date,amount,category\n2026-08-26,150000,fuel\n')
    expect(readyExpenses(result)[0]?.category_id).toBe('c1')
    expect(result.newCategories).toHaveLength(0)
  })

  it('honours the file over the category when the file is explicit', () => {
    const result = plan(
      'date,amount,category,counts_toward_budget,amortize_months\n2026-08-26,4.000.000,Mods & Parts,yes,12\n',
    )
    const [expense] = readyExpenses(result)
    expect(expense?.counts_toward_budget).toBe(true)
    expect(expense?.amortize_months).toBe(12)
  })

  it('skips a row already in the ledger, so a second import changes nothing', () => {
    const id = '11111111-1111-4111-8111-111111111111'
    const csv = `id,occurred_on,amount\n${id},2026-08-26,150000\n`

    const first = plan(csv)
    expect(first.ready).toBe(1)
    expect(readyExpenses(first)[0]?.id).toBe(id)

    const second = plan(csv, { ...CONTEXT, existingIds: new Set([id]) })
    expect(second.ready).toBe(0)
    expect(second.reasons).toEqual([{ reason: 'Already in the ledger', count: 1 }])
  })

  it('catches the same id twice inside one file', () => {
    const id = '11111111-1111-4111-8111-111111111111'
    const result = plan(`id,date,amount\n${id},2026-08-26,150000\n${id},2026-08-27,90000\n`)
    expect(result.ready).toBe(1)
    expect(result.rows[1]?.errors[0]).toBe('The same row id appears twice in this file')
  })

  it('gives a row with no id an id of its own', () => {
    const result = plan('date,amount\n2026-08-26,150000\n2026-08-27,90000\n')
    const [first, second] = readyExpenses(result)
    expect(first?.id).not.toBe(second?.id)
  })

  it('ignores a blank row left behind in a spreadsheet', () => {
    const result = plan('date,amount\n2026-08-26,150000\n,\n')
    expect(result.ready).toBe(1)
    expect(result.reasons).toEqual([{ reason: 'Empty row', count: 1 }])
  })

  it('refuses an odometer reading with no car to put it on', () => {
    const result = plan('date,amount,odometer_km\n2026-08-26,150000,41250\n')
    expect(result.rows[0]?.errors[0]).toBe('An odometer reading needs a vehicle')
  })

  it('reads a semicolon file with Vietnamese headers end to end', () => {
    const table = parseCsv('Ngày;Số tiền;Danh mục;Ghi chú\n26/08/2026;150.000;Fuel;Đổ xăng\n')
    const result = planImport(table, autoMap(table.header), CONTEXT, ids())
    const [expense] = readyExpenses(result)
    expect(expense?.occurred_on).toBe('2026-08-26')
    expect(expense?.amount).toBe(150000)
    expect(expense?.note).toBe('Đổ xăng')
  })
})

describe('idsInFile', () => {
  it('collects the ids a file names, once each', () => {
    const id = '11111111-1111-4111-8111-111111111111'
    const table = parseCsv(`id,amount\n${id},1\n${id.toUpperCase()},2\nnot-an-id,3\n`)
    expect(idsInFile(table, autoMap(table.header))).toEqual([id])
  })

  it('is empty when the file has no id column', () => {
    const table = parseCsv('date,amount\n2026-08-26,1\n')
    expect(idsInFile(table, autoMap(table.header))).toEqual([])
  })
})
