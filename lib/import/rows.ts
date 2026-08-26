/**
 * Turning a parsed file plus a column mapping into a plan.
 *
 * The plan is the dry run: every row either becomes an expense or collects the
 * reasons it cannot, and nothing is written until a person has read the summary
 * and agreed with it. A row that is wrong never stops the import — it is
 * skipped, counted, and named — because a file of four hundred rows with one bad
 * date should import three hundred and ninety-nine of them and say so.
 *
 * The one thing that *does* stop the import is the transaction: either every
 * ready row lands or none of them do. See `import_expenses` in migration 0020.
 *
 * Pure. No network, no clock, no `Date.now()`. Everything it needs arrives in
 * the context, which is what makes the whole thing testable and what makes the
 * preview redraw instantly when a dropdown changes.
 */

import { parseAmount } from '@/lib/money'
import { BUCKETS, type ExpenseBucket } from '@/lib/expenses/types'
import { normaliseHeader, type ColumnMapping } from '@/lib/import/fields'
import {
  IMPORT_ROW_LIMIT,
  type ImportContext,
  type ImportExpense,
  type ImportFieldKey,
  type ImportPlan,
  type NewCategory,
  type PlannedRow,
} from '@/lib/import/types'
import type { CsvTable } from '@/lib/csv/parse'

/** What a category invented by an import looks like. Renameable afterwards. */
const NEW_CATEGORY_ICON = 'DotsThree'
const NEW_CATEGORY_COLOUR = '#6B6357'

const DAYS_IN_MONTH = [31, 29, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31]

function isRealDate(year: number, month: number, day: number): boolean {
  if (month < 1 || month > 12 || day < 1) return false
  if (month === 2 && day === 29) {
    return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0
  }
  return day <= (DAYS_IN_MONTH[month - 1] ?? 0)
}

function iso(year: number, month: number, day: number): string {
  return `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
}

/**
 * A date, read the way people actually write them.
 *
 * Year-first is unambiguous and is tried first. Everything else is day-first,
 * because the app's locale is `vi-VN` and 01/02/2026 is the first of February
 * in every country that writes it with slashes and most that do not. A file
 * from an American export will import a twelfth of its rows to the wrong month
 * and the rest not at all — which is loud, and better than silent.
 *
 * A timestamp is accepted and its time thrown away: an expense happens on a day.
 */
export function parseImportDate(input: string): string | null {
  const text = input.trim()
  if (text === '') return null

  const isoLike = /^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})(?:[T\s].*)?$/.exec(text)
  if (isoLike) {
    const [, y = '', m = '', d = ''] = isoLike
    const year = Number(y)
    const month = Number(m)
    const day = Number(d)
    return isRealDate(year, month, day) ? iso(year, month, day) : null
  }

  const dayFirst = /^(\d{1,2})[-/.](\d{1,2})[-/.](\d{2}|\d{4})(?:[T\s].*)?$/.exec(text)
  if (dayFirst) {
    const [, d = '', m = '', y = ''] = dayFirst
    const day = Number(d)
    const month = Number(m)
    // A two-digit year is this century. An expense from 1974 is not being
    // imported into a car app.
    const year = y.length === 2 ? 2000 + Number(y) : Number(y)
    return isRealDate(year, month, day) ? iso(year, month, day) : null
  }

  const packed = /^(\d{4})(\d{2})(\d{2})$/.exec(text)
  if (packed) {
    const [, y = '', m = '', d = ''] = packed
    const year = Number(y)
    const month = Number(m)
    const day = Number(d)
    return isRealDate(year, month, day) ? iso(year, month, day) : null
  }

  return null
}

/**
 * An amount, in minor units.
 *
 * `parseAmount` already reads everything the amount field reads — `150k`,
 * `1.2m`, `150.000`, a currency sign either side. Two things are added here
 * because they only ever appear in exported files: accounting parentheses, and
 * a trailing minus.
 */
export function parseImportAmount(input: string, currency: string): number | null {
  let text = input.trim()
  if (text === '') return null

  let negative = false

  if (text.startsWith('(') && text.endsWith(')')) {
    negative = true
    text = text.slice(1, -1).trim()
  }

  if (text.endsWith('-')) {
    negative = true
    text = text.slice(0, -1).trim()
  }

  const amount = parseAmount(text, currency)
  if (amount === null) return null
  return negative ? -amount : amount
}

const TRUE_WORDS = new Set(['true', 'yes', 'y', '1', 'on', 'x', 'co', 'cothue', 'dung'])
const FALSE_WORDS = new Set(['false', 'no', 'n', '0', 'off', 'khong', 'sai'])

/** Yes or no, or null when the cell says neither. */
export function parseImportBoolean(input: string): boolean | null {
  const word = normaliseHeader(input)
  if (word === '') return null
  if (TRUE_WORDS.has(word)) return true
  if (FALSE_WORDS.has(word)) return false
  return null
}

/** A bucket, by its stored name or by the label the app shows for it. */
export function parseImportBucket(input: string): ExpenseBucket | null {
  const word = normaliseHeader(input)
  if (word === '') return null

  const direct = BUCKETS.find((bucket) => normaliseHeader(bucket) === word)
  if (direct) return direct

  if (word === 'life' || word === 'personal') return 'life'
  if (word === 'running' || word === 'carrunning') return 'car_running'
  if (word === 'project' || word === 'carproject' || word === 'mods') return 'car_project'
  return null
}

function parseWholeNumber(input: string): number | null {
  const text = input.trim().replace(/[\s.,]/g, '')
  if (!/^\d+$/.test(text)) return null
  const value = Number(text)
  return Number.isSafeInteger(value) ? value : null
}

/** Names are matched with accents composed, case folded and spaces collapsed. */
function matchKey(value: string): string {
  return value.normalize('NFC').trim().toLocaleLowerCase()
}

function cellsOf(row: readonly string[], mapping: ColumnMapping): Partial<Record<ImportFieldKey, string>> {
  const cells: Partial<Record<ImportFieldKey, string>> = {}
  for (const [key, index] of Object.entries(mapping) as [ImportFieldKey, number][]) {
    const value = row[index]
    if (value !== undefined) cells[key] = value
  }
  return cells
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/**
 * The dry run.
 *
 * Every row is planned against the same context, so the counts in the summary
 * are the counts the commit will produce — the button says "Import 142
 * expenses" because 142 rows came out of here ready, not because 142 rows went
 * in.
 */
export function planImport(
  table: CsvTable,
  mapping: ColumnMapping,
  context: ImportContext,
  newId: () => string = () => crypto.randomUUID(),
): ImportPlan {
  const categoriesByName = new Map(
    context.categories.map((category) => [matchKey(category.name), category]),
  )
  const vehiclesByName = new Map(
    context.vehicles.map((vehicle) => [matchKey(vehicle.nickname), vehicle]),
  )

  const newCategories: NewCategory[] = []
  const newCategoriesByName = new Map<string, NewCategory>()
  const seenIds = new Set<string>()

  const rows: PlannedRow[] = []
  let ready = 0

  const overLimit = table.rows.length > IMPORT_ROW_LIMIT

  table.rows.forEach((raw, index) => {
    const line = table.lines[index] ?? index + 2
    const cells = cellsOf(raw, mapping)
    const errors: string[] = []

    // An entirely empty row is a row somebody left behind in a spreadsheet, not
    // a row that failed. It is skipped without a complaint against it.
    const blank = Object.values(cells).every((value) => (value ?? '').trim() === '')
    if (blank) {
      rows.push({ line, cells, expense: null, errors: ['Empty row'], status: 'skipped', newCategory: null })
      return
    }

    const currencyCell = (cells.currency ?? '').trim().toUpperCase()
    const currency = /^[A-Z]{3}$/.test(currencyCell) ? currencyCell : context.currency
    if (currencyCell !== '' && !/^[A-Z]{3}$/.test(currencyCell)) {
      errors.push(`"${currencyCell}" is not a three-letter currency`)
    }

    const occurredOn = parseImportDate(cells.occurred_on ?? '')
    if (occurredOn === null) {
      errors.push(
        (cells.occurred_on ?? '').trim() === ''
          ? 'No date'
          : `"${(cells.occurred_on ?? '').trim()}" is not a date`,
      )
    }

    const amount = parseImportAmount(cells.amount ?? '', currency)
    if (amount === null) {
      errors.push(
        (cells.amount ?? '').trim() === ''
          ? 'No amount'
          : `"${(cells.amount ?? '').trim()}" is not an amount`,
      )
    } else if (amount === 0) {
      errors.push('Amount is zero')
    }

    // --- The vehicle. Never created: a car has a purchase reading, a purchase
    // date and a photo, and inventing one from a nickname in a spreadsheet would
    // put a vehicle in the garage that nobody chose to add.
    const vehicleCell = (cells.vehicle ?? '').trim()
    let vehicleId: string | null = null
    if (vehicleCell !== '') {
      const vehicle = vehiclesByName.get(matchKey(vehicleCell))
      if (vehicle) vehicleId = vehicle.id
      else errors.push(`No vehicle called "${vehicleCell}"`)
    }

    // --- The category. Created when the name is new, because a category is a
    // name, a colour and two defaults, and all four can be edited afterwards.
    const categoryCell = (cells.category ?? '').trim()
    const existingCategory = categoryCell === '' ? undefined : categoriesByName.get(matchKey(categoryCell))
    const pendingCategory = categoryCell === '' ? undefined : newCategoriesByName.get(matchKey(categoryCell))

    // --- The bucket, and the two defaults that follow from it.
    const bucketCell = (cells.bucket ?? '').trim()
    const namedBucket = parseImportBucket(bucketCell)
    if (bucketCell !== '' && namedBucket === null) {
      errors.push(`"${bucketCell}" is not a bucket`)
    }

    const categoryBucket = existingCategory?.default_bucket ?? pendingCategory?.default_bucket ?? null
    let bucket: ExpenseBucket =
      namedBucket ?? categoryBucket ?? (vehicleCell === '' ? 'life' : 'car_running')

    // The check constraint on `expenses` is the same sentence: a car bucket
    // needs a car, and life spend cannot have one. A file that names neither
    // gets the bucket that fits rather than an error.
    if (bucket !== 'life' && vehicleCell === '') {
      if (namedBucket === null) bucket = 'life'
      else errors.push('A car bucket needs a vehicle')
    }
    if (bucket === 'life' && vehicleId !== null) {
      if (namedBucket === null) bucket = 'car_running'
      else errors.push('Life spend cannot have a vehicle')
    }

    const countsCell = (cells.counts_toward_budget ?? '').trim()
    const namedCounts = parseImportBoolean(countsCell)
    if (countsCell !== '' && namedCounts === null) {
      errors.push(`"${countsCell}" is not a yes or a no`)
    }
    const counts =
      namedCounts ??
      existingCategory?.default_counts_toward_budget ??
      pendingCategory?.default_counts_toward_budget ??
      true

    const monthsCell = (cells.amortize_months ?? '').trim()
    let months = 1
    if (monthsCell !== '') {
      const parsed = parseWholeNumber(monthsCell)
      if (parsed === null || parsed < 1 || parsed > 120) {
        errors.push(`"${monthsCell}" is not a number of months between 1 and 120`)
      } else {
        months = parsed
      }
    }

    const odometerCell = (cells.odometer_km ?? '').trim()
    let odometer: number | null = null
    if (odometerCell !== '') {
      const parsed = parseWholeNumber(odometerCell)
      if (parsed === null || parsed > 9_999_999) errors.push(`"${odometerCell}" is not an odometer reading`)
      else if (vehicleCell === '') errors.push('An odometer reading needs a vehicle')
      else odometer = parsed
    }

    // --- The id, which is what makes a second import of the same file harmless.
    const idCell = (cells.id ?? '').trim()
    let id = idCell
    if (idCell !== '') {
      if (!UUID.test(idCell)) {
        errors.push(`"${idCell}" is not a row id`)
      } else if (context.existingIds?.has(idCell.toLowerCase())) {
        errors.push('Already in the ledger')
      } else if (seenIds.has(idCell.toLowerCase())) {
        errors.push('The same row id appears twice in this file')
      }
    } else {
      id = newId()
    }

    if (errors.length > 0) {
      rows.push({ line, cells, expense: null, errors, status: 'skipped', newCategory: null })
      return
    }

    // Past this point the row is going in, so the category it named can be
    // created. Doing it here rather than above is what keeps a skipped row from
    // inventing a category nothing will ever use.
    let categoryId: string | null = existingCategory?.id ?? pendingCategory?.id ?? null
    let createdName: string | null = null

    if (categoryId === null && categoryCell !== '') {
      const created: NewCategory = {
        id: newId(),
        name: categoryCell,
        icon: NEW_CATEGORY_ICON,
        colour_hex: NEW_CATEGORY_COLOUR,
        default_bucket: bucket,
        default_counts_toward_budget: counts,
      }
      newCategories.push(created)
      newCategoriesByName.set(matchKey(categoryCell), created)
      categoryId = created.id
      createdName = created.name
    }

    if (idCell !== '') seenIds.add(idCell.toLowerCase())

    const expense: ImportExpense = {
      id,
      occurred_on: occurredOn as string,
      amount: amount as number,
      currency,
      category_id: categoryId,
      vehicle_id: vehicleId,
      bucket,
      counts_toward_budget: counts,
      amortize_months: months,
      merchant: (cells.merchant ?? '').trim() || null,
      note: (cells.note ?? '').trim() || null,
      odometer_km: odometer,
    }

    ready += 1
    rows.push({ line, cells, expense, errors: [], status: 'ready', newCategory: createdName })
  })

  // The summary groups by the first reason a row gave, because a row with three
  // problems is one row to fix and listing it three times makes the file look
  // worse than it is.
  const reasonCounts = new Map<string, number>()
  for (const row of rows) {
    if (row.status !== 'skipped') continue
    const reason = row.errors[0] ?? 'Skipped'
    reasonCounts.set(reason, (reasonCounts.get(reason) ?? 0) + 1)
  }

  const reasons = [...reasonCounts]
    .map(([reason, count]) => ({ reason, count }))
    .sort((a, b) => b.count - a.count || a.reason.localeCompare(b.reason))

  return {
    rows,
    ready,
    skipped: rows.length - ready,
    reasons,
    newCategories,
    overLimit,
  }
}

/** The rows a commit sends. Ready ones only, in file order. */
export function readyExpenses(plan: ImportPlan): ImportExpense[] {
  return plan.rows
    .map((row) => row.expense)
    .filter((expense): expense is ImportExpense => expense !== null)
}

/** Every expense id the file names, so the ledger can be asked which it has. */
export function idsInFile(table: CsvTable, mapping: ColumnMapping): string[] {
  const index = mapping.id
  if (index === undefined) return []

  const ids = new Set<string>()
  for (const row of table.rows) {
    const value = (row[index] ?? '').trim()
    if (UUID.test(value)) ids.add(value.toLowerCase())
  }
  return [...ids]
}
