import { addMonthsToMonthStart, monthStart, type IsoDate } from '@/lib/dates'
import type { ExpenseBucket } from '@/lib/expenses/types'

/**
 * Reports run over whole months.
 *
 * Not an arbitrary date range, and that is a decision rather than a shortcut.
 * Half the figures on the screen are amortised, and an amortised slice belongs
 * to a month rather than to a day — asking what a set of tyres spread over
 * twenty-four months contributed between the 3rd and the 19th of March has no
 * answer. Snapping the range to months means the monthly column and the all-in
 * column sit on the same axis and can honestly be read side by side.
 */
export const REPORT_PERIODS = [
  { key: '3m', label: '3 months', months: 3 },
  { key: '6m', label: '6 months', months: 6 },
  { key: '12m', label: '12 months', months: 12 },
] as const

export type ReportPeriodKey = (typeof REPORT_PERIODS)[number]['key']

export const DEFAULT_REPORT_PERIOD: ReportPeriodKey = '6m'

/** The URL search param the period lives in. */
export const REPORT_PERIOD_PARAM = 'period'

export function isReportPeriod(value: unknown): value is ReportPeriodKey {
  return (
    typeof value === 'string' && REPORT_PERIODS.some((period) => period.key === value)
  )
}

/** A hand-edited URL should show a report, not an error page. */
export function parseReportPeriod(value: unknown): ReportPeriodKey {
  return isReportPeriod(value) ? value : DEFAULT_REPORT_PERIOD
}

export function periodMonths(key: ReportPeriodKey): number {
  return REPORT_PERIODS.find((period) => period.key === key)?.months ?? 6
}

export type ReportRange = { from: IsoDate; to: IsoDate; months: number }

/** The range a period key means, ending with the month the day falls in. */
export function rangeFor(key: ReportPeriodKey, today: IsoDate): ReportRange {
  const months = periodMonths(key)
  const to = monthStart(today)
  return { from: addMonthsToMonthStart(to, -(months - 1)), to, months }
}

/** One month of the month-over-month series, both views side by side. */
export type MonthPoint = {
  month: IsoDate
  monthly_total: number
  all_in_total: number
  car_only_total: number
  monthly_count: number
  all_in_count: number
  car_only_count: number
}

export type CategoryReportRow = {
  category_id: string | null
  name: string | null
  icon: string | null
  colour_hex: string | null
  bucket: ExpenseBucket | null
  monthly_total: number
  all_in_total: number
  expense_count: number
}

export type BucketReportRow = {
  bucket: ExpenseBucket
  monthly_total: number
  all_in_total: number
  expense_count: number
}

export type TopExpenseRow = {
  id: string
  occurred_on: IsoDate
  amount: number
  currency: string
  merchant: string | null
  note: string | null
  category_id: string | null
  category_name: string | null
  category_icon: string | null
  category_colour_hex: string | null
  vehicle_id: string | null
  vehicle_nickname: string | null
  bucket: ExpenseBucket
  counts_toward_budget: boolean
  amortize_months: number
}

/** Everything one report screen holds. Fetched in parallel, on the server. */
export type ReportSnapshot = {
  range: ReportRange
  currency: string
  months: MonthPoint[]
  categories: CategoryReportRow[]
  buckets: BucketReportRow[]
  top: TopExpenseRow[]
}

/**
 * Life against car, which is the split docs/01-PRODUCT.md asks the reports to
 * show. It is the bucket rows added up two ways rather than a fourth query,
 * because `car` is exactly "the two buckets whose name starts with car".
 */
export type LifeCarSplit = {
  life: { monthly_total: number; all_in_total: number; expense_count: number }
  car: { monthly_total: number; all_in_total: number; expense_count: number }
  running: BucketReportRow
  project: BucketReportRow
}

const EMPTY_BUCKET = (bucket: ExpenseBucket): BucketReportRow => ({
  bucket,
  monthly_total: 0,
  all_in_total: 0,
  expense_count: 0,
})

export function lifeCarSplit(rows: readonly BucketReportRow[]): LifeCarSplit {
  const find = (bucket: ExpenseBucket) =>
    rows.find((row) => row.bucket === bucket) ?? EMPTY_BUCKET(bucket)

  const life = find('life')
  const running = find('car_running')
  const project = find('car_project')

  return {
    life: {
      monthly_total: life.monthly_total,
      all_in_total: life.all_in_total,
      expense_count: life.expense_count,
    },
    car: {
      monthly_total: running.monthly_total + project.monthly_total,
      all_in_total: running.all_in_total + project.all_in_total,
      expense_count: running.expense_count + project.expense_count,
    },
    running,
    project,
  }
}
