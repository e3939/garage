/**
 * When a fund lands, against dates worked out by hand.
 *
 * The hermetic half of the pair. `lib/queries/money-tools.db.test.ts` runs the
 * same funds through `v_fund_status` and asserts the view agrees; if it ever
 * does not, the view is right and `lib/funds/projection.ts` is the bug.
 *
 * The figures are VND, so a minor unit is a dong and 2.000.000 is two million
 * of them. Nothing here rounds money — the only rounding is the month count,
 * which goes up, because a fund is not funded until the last contribution has
 * actually been made.
 */

import { describe, expect, it } from 'vitest'

import { fundProgress, projectFund } from '@/lib/funds/projection'
import type { IsoDate } from '@/lib/dates'

const FROM = '2026-08-26' as IsoDate

describe('projectFund', () => {
  it('divides what is left by the rate and rounds the month up', () => {
    // 15.000.000 left at 2.000.000 a month is seven and a half months, which is
    // eight: the fund is not there until August's contribution lands.
    expect(
      projectFund({
        target: 20_000_000,
        balance: 5_000_000,
        monthlyContribution: 2_000_000,
        from: FROM,
      }),
    ).toEqual({ remaining: 15_000_000, monthsRemaining: 8, projectedOn: '2027-04-01' })
  })

  it('does not round a whole number of months up to the next one', () => {
    expect(
      projectFund({
        target: 10_000_000,
        balance: 0,
        monthlyContribution: 2_500_000,
        from: FROM,
      }),
    ).toEqual({ remaining: 10_000_000, monthsRemaining: 4, projectedOn: '2026-12-01' })
  })

  it('counts from the start of the month, not from the day', () => {
    // The 1st and the 26th of the same month project to the same date: the
    // sentence is "funded by March", and a month is the unit it deals in.
    const first = projectFund({
      target: 6_000_000,
      balance: 0,
      monthlyContribution: 1_000_000,
      from: '2026-08-01' as IsoDate,
    })
    const last = projectFund({
      target: 6_000_000,
      balance: 0,
      monthlyContribution: 1_000_000,
      from: '2026-08-31' as IsoDate,
    })

    expect(first).toEqual(last)
    expect(first.projectedOn).toBe('2027-02-01')
  })

  it('says this month when the fund is already there', () => {
    expect(
      projectFund({
        target: 5_000_000,
        balance: 5_000_000,
        monthlyContribution: 1_000_000,
        from: FROM,
      }),
    ).toEqual({ remaining: 0, monthsRemaining: 0, projectedOn: '2026-08-01' })
  })

  it('treats an overfunded fund as funded rather than as owing a negative', () => {
    expect(
      projectFund({
        target: 5_000_000,
        balance: 8_000_000,
        monthlyContribution: 1_000_000,
        from: FROM,
      }),
    ).toEqual({ remaining: 0, monthsRemaining: 0, projectedOn: '2026-08-01' })
  })

  it('refuses to name a date with no contribution rate', () => {
    for (const rate of [null, 0]) {
      expect(
        projectFund({ target: 5_000_000, balance: 1_000_000, monthlyContribution: rate, from: FROM }),
      ).toEqual({ remaining: 4_000_000, monthsRemaining: null, projectedOn: null })
    }
  })

  it('handles a balance drawn down below zero without inventing a shorter wait', () => {
    // A drawdown is a negative contribution, so a balance can be negative if a
    // fund was emptied and then spent against. What is left grows; it does not
    // wrap round.
    expect(
      projectFund({
        target: 5_000_000,
        balance: -1_000_000,
        monthlyContribution: 2_000_000,
        from: FROM,
      }),
    ).toEqual({ remaining: 6_000_000, monthsRemaining: 3, projectedOn: '2026-11-01' })
  })

  it('refuses money that is not a whole number of minor units', () => {
    expect(() =>
      projectFund({ target: 5_000_000.5, balance: 0, monthlyContribution: 1, from: FROM }),
    ).toThrow(TypeError)
    expect(() =>
      projectFund({ target: 5_000_000, balance: 0.25, monthlyContribution: 1, from: FROM }),
    ).toThrow(TypeError)
  })
})

describe('fundProgress', () => {
  it('is the fraction of the target that is in the fund', () => {
    expect(fundProgress(20_000_000, 5_000_000)).toBe(0.25)
    expect(fundProgress(20_000_000, 20_000_000)).toBe(1)
  })

  it('goes past one rather than capping, because overfunded is a real state', () => {
    expect(fundProgress(20_000_000, 25_000_000)).toBe(1.25)
  })

  it('is null against a target of nothing', () => {
    expect(fundProgress(0, 5_000_000)).toBeNull()
  })
})
