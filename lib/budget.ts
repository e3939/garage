/**
 * Bucket resolution and amortisation.
 *
 * Two independent properties travel with every expense: which bucket of money it
 * came out of, and whether it counts toward the monthly budget. A category
 * carries a default for both; an expense may override both. That is the whole
 * mechanism (docs/01-PRODUCT.md, "the bucket and the switch").
 *
 * `amortiseSlices` is a mirror of the `v_expense_impact` view. The view is the
 * only implementation of amortisation in the database; this is the only one on
 * the client, and it exists so an optimistic write can show the right monthly
 * number before the server answers. If the two ever disagree the view wins and
 * this file is the bug.
 */

import { splitMinor } from '@/lib/money'
import type { Enums } from '@/lib/supabase/types'

export type ExpenseBucket = Enums<'expense_bucket'>

/** An ISO date, `YYYY-MM-DD`. Postgres `date` columns arrive in this shape. */
export type IsoDate = string

export const CAR_BUCKETS: readonly ExpenseBucket[] = ['car_running', 'car_project']

export function isCarBucket(bucket: ExpenseBucket): boolean {
  return bucket !== 'life'
}

/**
 * Whether a bucket counts toward the monthly budget when nothing more specific
 * says otherwise. A project spend is the exception: it lands in the ledger, the
 * build log and the lifetime cost of ownership, and stays out of "did I overspend
 * in August". Settings may hand a different policy in.
 */
export const DEFAULT_BUDGET_POLICY: Readonly<Record<ExpenseBucket, boolean>> = {
  life: true,
  car_running: true,
  car_project: false,
}

/** The parts of a category this module cares about. */
export type CategoryDefaults = {
  default_bucket: ExpenseBucket
  default_counts_toward_budget: boolean
}

export type ResolveBucketInput = {
  /** What the expense itself says, if the user touched the chip. */
  override?: ExpenseBucket | null
  /** The category's default, if a category is chosen. */
  category?: CategoryDefaults | null
  /** Whether a vehicle is attached to this expense. */
  hasVehicle: boolean
}

/**
 * Decide an expense's bucket.
 *
 * The result is always consistent with the vehicle, because the database will
 * not accept anything else: a car bucket requires a vehicle and `life` requires
 * the absence of one. So attaching a vehicle to a grocery run makes it a running
 * cost, and removing the vehicle from a set of coilovers makes it life spend.
 * The form is expected to show the chip changing, not to do this silently.
 */
export function resolveBucket({ override, category, hasVehicle }: ResolveBucketInput): ExpenseBucket {
  const candidate: ExpenseBucket =
    override ?? category?.default_bucket ?? (hasVehicle ? 'car_running' : 'life')

  if (hasVehicle && candidate === 'life') return 'car_running'
  if (!hasVehicle && candidate !== 'life') return 'life'
  return candidate
}

export type ResolveCountsInput = {
  /** What the expense itself says, if the user touched the switch. */
  override?: boolean | null
  /** The category's default, if a category is chosen. */
  category?: CategoryDefaults | null
  /** The bucket the expense resolved to. */
  bucket: ExpenseBucket
  /** Overrides the per-bucket default policy. */
  policy?: Readonly<Record<ExpenseBucket, boolean>>
}

/**
 * Decide whether an expense counts toward the monthly budget.
 * Expense override first, then the category default, then the bucket policy.
 */
export function resolveCountsTowardBudget({
  override,
  category,
  bucket,
  policy = DEFAULT_BUDGET_POLICY,
}: ResolveCountsInput): boolean {
  if (override !== undefined && override !== null) return override
  if (category) return category.default_counts_toward_budget
  return policy[bucket]
}

// ---------------------------------------------------------------------------
// Amortisation
// ---------------------------------------------------------------------------

/** One month of budget impact. */
export type ImpactSlice = {
  /** First of the month, `YYYY-MM-DD`, matching the view's `impact_month`. */
  impact_month: IsoDate
  /** Minor units. */
  amount: number
}

export type AmortiseInput = {
  amount: number
  occurred_on: IsoDate
  amortize_months: number
  counts_toward_budget: boolean
  is_draft?: boolean
}

const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/

/**
 * Add whole months to the first of a month, with no timezone anywhere near it.
 * The app runs in Asia/Ho_Chi_Minh; a `date` column has no time and must not
 * acquire one by passing through a Date object.
 */
function monthStartPlus(date: IsoDate, months: number): IsoDate {
  const parts = ISO_DATE.exec(date)
  if (!parts) throw new RangeError(`occurred_on must be YYYY-MM-DD, got ${date}`)

  const year = Number(parts[1])
  const month = Number(parts[2]) // 1-12
  const total = year * 12 + (month - 1) + months
  const nextYear = Math.floor(total / 12)
  const nextMonth = total - nextYear * 12 + 1

  return `${String(nextYear).padStart(4, '0')}-${String(nextMonth).padStart(2, '0')}-01`
}

/**
 * Expand one expense into its monthly budget slices, exactly as
 * `v_expense_impact` does.
 *
 * - An expense that does not count toward the budget produces nothing; it is
 *   already out of the monthly picture, so amortisation is meaningless for it.
 * - A draft produces nothing until it is confirmed.
 * - Spreading starts in the month the expense happened.
 * - Integer split, remainder on the first slice: 100 over 3 is 34, 33, 33, and
 *   -100 over 3 is -34, -33, -33.
 */
export function amortiseSlices({
  amount,
  occurred_on,
  amortize_months,
  counts_toward_budget,
  is_draft = false,
}: AmortiseInput): ImpactSlice[] {
  if (!counts_toward_budget || is_draft) return []
  if (!Number.isInteger(amortize_months) || amortize_months < 1 || amortize_months > 120) {
    throw new RangeError(`amortize_months must be an integer between 1 and 120, got ${String(amortize_months)}`)
  }

  return splitMinor(amount, amortize_months).map((slice, index) => ({
    impact_month: monthStartPlus(occurred_on, index),
    amount: slice,
  }))
}

/** The slice of an expense that lands in one particular month, or zero. */
export function impactInMonth(input: AmortiseInput, month: IsoDate): number {
  const target = monthStartPlus(month, 0)
  return amortiseSlices(input)
    .filter((slice) => slice.impact_month === target)
    .reduce((total, slice) => total + slice.amount, 0)
}
