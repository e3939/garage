/**
 * The three views of the same data.
 *
 * docs/01-PRODUCT.md, core concept 1:
 *
 *   Monthly   only `counts_toward_budget = true`. This is your discipline number.
 *   All-in    everything. This is the truth.
 *   Car only  every bucket beginning `car_`, ignoring the budget switch. This is
 *             the cost-of-ownership number.
 *
 *   "Never show a total without the view label next to it. Ambiguity here
 *    destroys the whole point."
 *
 * Amortisation belongs to the budget view alone — a cash-out view uses the full
 * amount on the date it was paid — which is why the same month can honestly show
 * three different figures. The arithmetic lives in `v_month_totals`; this module
 * only names the views and decides which column a screen is reading.
 */

export const SPEND_VIEWS = ['monthly', 'all_in', 'car_only'] as const

export type SpendView = (typeof SPEND_VIEWS)[number]

export const DEFAULT_SPEND_VIEW: SpendView = 'monthly'

/** The label that sits next to every total. Never abbreviate these away. */
export const SPEND_VIEW_LABEL: Readonly<Record<SpendView, string>> = {
  monthly: 'Monthly',
  all_in: 'All-in',
  car_only: 'Car only',
}

/** One sentence under a hero figure, saying what it counted and what it did not. */
export const SPEND_VIEW_DESCRIPTION: Readonly<Record<SpendView, string>> = {
  monthly:
    'Counts only what is set to affect the budget, spread over the months it was spread across.',
  all_in: 'Everything paid this month, at full amount, on the day it was paid.',
  car_only: 'Every car bucket at full amount, whatever the budget switch says.',
}

/** The URL search param the switcher lives in. */
export const SPEND_VIEW_PARAM = 'view'

export function isSpendView(value: unknown): value is SpendView {
  return typeof value === 'string' && (SPEND_VIEWS as readonly string[]).includes(value)
}

/**
 * Anything unreadable falls back rather than erroring — a hand-edited URL should
 * show a total, not an error page. The fallback is the profile's `default_view`,
 * which is what makes the switcher persist across screens and sessions.
 */
export function parseSpendView(value: unknown, fallback: SpendView = DEFAULT_SPEND_VIEW): SpendView {
  return isSpendView(value) ? value : fallback
}

/** The three figures a month carries, as `v_month_totals` returns them. */
export type MonthViewTotals = {
  monthly_total: number
  monthly_count: number
  all_in_total: number
  all_in_count: number
  car_only_total: number
  car_only_count: number
}

export const EMPTY_MONTH_TOTALS: MonthViewTotals = {
  monthly_total: 0,
  monthly_count: 0,
  all_in_total: 0,
  all_in_count: 0,
  car_only_total: 0,
  car_only_count: 0,
}

/** Pick the column the selected view is asking for. No arithmetic happens here. */
export function totalForView(totals: MonthViewTotals, view: SpendView): number {
  if (view === 'all_in') return totals.all_in_total
  if (view === 'car_only') return totals.car_only_total
  return totals.monthly_total
}

export function countForView(totals: MonthViewTotals, view: SpendView): number {
  if (view === 'all_in') return totals.all_in_count
  if (view === 'car_only') return totals.car_only_count
  return totals.monthly_count
}
