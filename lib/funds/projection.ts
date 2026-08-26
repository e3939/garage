/**
 * When a fund lands.
 *
 * A mirror of the projection in `v_fund_status`, exactly as `amortiseSlices` is
 * a mirror of `v_expense_impact`: the view is the implementation and this is the
 * copy that lets the fund sheet answer "funded by when?" while somebody is still
 * typing the target. If the two ever disagree, the view wins and this file is
 * the bug.
 *
 * The arithmetic is deliberately naive, and the sentence it produces says so out
 * loud: "At 2.000.000 dong a month, funded by March 2027" is a claim about a
 * contribution that keeps being made, not a forecast. Nothing here knows whether
 * it will be.
 */

import { addMonthsToMonthStart, monthStart, type IsoDate } from '@/lib/dates'
import { assertMinorAmount } from '@/lib/money'

export type ProjectFundInput = {
  /** Minor units. */
  target: number
  /** Minor units. Sum of contributions, drawdowns included. */
  balance: number
  /** Minor units per month, or null when no rate has been set. */
  monthlyContribution: number | null
  /** Any day in the month to count from. Today, normally. */
  from: IsoDate
}

export type FundProjection = {
  /** What is left to put in. Never negative — an overfunded fund needs nothing. */
  remaining: number
  /** Months at the current rate, or null when there is no rate. Zero when funded. */
  monthsRemaining: number | null
  /** First of the month it lands in, or null when there is no rate. */
  projectedOn: IsoDate | null
}

export function projectFund({
  target,
  balance,
  monthlyContribution,
  from,
}: ProjectFundInput): FundProjection {
  assertMinorAmount(target, 'target')
  assertMinorAmount(balance, 'balance')

  const remaining = Math.max(target - balance, 0)
  const start = monthStart(from)

  // Already there. The date is this month rather than null, because "funded"
  // is a state with a date on it and null means "cannot say".
  if (remaining === 0) {
    return { remaining: 0, monthsRemaining: 0, projectedOn: start }
  }

  if (monthlyContribution === null || monthlyContribution <= 0) {
    return { remaining, monthsRemaining: null, projectedOn: null }
  }

  const monthsRemaining = Math.ceil(remaining / monthlyContribution)

  return {
    remaining,
    monthsRemaining,
    projectedOn: addMonthsToMonthStart(start, monthsRemaining),
  }
}

/**
 * How far along a fund is, as a fraction. Null when the target is zero, because
 * a fraction of nothing is not a number anybody can act on.
 */
export function fundProgress(target: number, balance: number): number | null {
  if (target === 0) return null
  return balance / target
}
