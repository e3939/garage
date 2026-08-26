/**
 * The cadence arithmetic, against dates worked out by hand.
 *
 * This is the hermetic half of the pair, in the same shape as
 * `lib/fuel/consumption.test.ts`: the numbers here are the answers, written down
 * by a person, and `lib/recurring/cadence.db.test.ts` runs the same cases
 * through `next_recurrence_due` in the database to prove the two implementations
 * agree. If the view and the module ever disagree, the database is right and
 * this module is the bug — but if they agree with each other and both disagree
 * with this file, they have drifted together and that is what this catches.
 *
 * Almost every case here is about the end of a month, because that is the only
 * place this arithmetic is interesting.
 */

import { describe, expect, it } from 'vitest'

import { daysInMonth, firstDueOnOrAfter, nextDueAfter } from '@/lib/recurring/cadence'
import type { IsoDate } from '@/lib/dates'

const iso = (value: string): IsoDate => value as IsoDate

describe('daysInMonth', () => {
  it('knows the short months and the leap years', () => {
    expect(daysInMonth(2026, 1)).toBe(31)
    expect(daysInMonth(2026, 2)).toBe(28)
    expect(daysInMonth(2024, 2)).toBe(29)
    expect(daysInMonth(2000, 2)).toBe(29)
    expect(daysInMonth(1900, 2)).toBe(28)
    expect(daysInMonth(2026, 4)).toBe(30)
    expect(daysInMonth(2026, 12)).toBe(31)
  })
})

describe('nextDueAfter', () => {
  it('adds a month, a quarter and a year', () => {
    expect(nextDueAfter({ cadence: 'monthly', from: iso('2026-08-15') })).toBe('2026-09-15')
    expect(nextDueAfter({ cadence: 'quarterly', from: iso('2026-08-15') })).toBe('2026-11-15')
    expect(nextDueAfter({ cadence: 'yearly', from: iso('2026-08-15') })).toBe('2027-08-15')
  })

  it('rolls the year over', () => {
    expect(nextDueAfter({ cadence: 'monthly', from: iso('2026-12-10') })).toBe('2027-01-10')
    expect(nextDueAfter({ cadence: 'quarterly', from: iso('2026-11-10') })).toBe('2027-02-10')
  })

  /**
   * The rule the whole module exists for. A template due on the 31st is due on
   * the 31st; April is what is wrong, not the template. So the stored day is
   * clamped on the way into a short month and comes back out again after it —
   * it is never overwritten with what the short month allowed.
   */
  it('clamps into a short month and comes back out of it', () => {
    const day = 31
    const cadence = 'monthly' as const

    const january = iso('2026-01-31')
    const february = nextDueAfter({ cadence, from: january, dayOfMonth: day })
    const march = nextDueAfter({ cadence, from: iso(february), dayOfMonth: day })
    const april = nextDueAfter({ cadence, from: iso(march), dayOfMonth: day })
    const may = nextDueAfter({ cadence, from: iso(april), dayOfMonth: day })

    expect([february, march, april, may]).toEqual([
      '2026-02-28',
      '2026-03-31',
      '2026-04-30',
      '2026-05-31',
    ])
  })

  it('walks a whole year down without drifting off the 31st', () => {
    let date = '2026-01-31'
    const seen: string[] = []
    for (let step = 0; step < 12; step += 1) {
      date = nextDueAfter({ cadence: 'monthly', from: iso(date), dayOfMonth: 31 })
      seen.push(date)
    }

    // Every long month still lands on its last day. Nothing has walked to the
    // 28th and stayed there, which is what `+ interval '1 month'` would do.
    expect(seen).toEqual([
      '2026-02-28',
      '2026-03-31',
      '2026-04-30',
      '2026-05-31',
      '2026-06-30',
      '2026-07-31',
      '2026-08-31',
      '2026-09-30',
      '2026-10-31',
      '2026-11-30',
      '2026-12-31',
      '2027-01-31',
    ])
  })

  it('clamps a quarterly template into a thirty-day month', () => {
    expect(
      nextDueAfter({ cadence: 'quarterly', from: iso('2026-01-31'), dayOfMonth: 31 }),
    ).toBe('2026-04-30')
  })

  it('keeps a yearly template on its own month and day', () => {
    expect(
      nextDueAfter({
        cadence: 'yearly',
        from: iso('2026-03-15'),
        dayOfMonth: 15,
        monthOfYear: 3,
      }),
    ).toBe('2027-03-15')
  })

  it('survives a leap day and recovers on the next leap year', () => {
    const yearly = { cadence: 'yearly' as const, dayOfMonth: 29, monthOfYear: 2 }

    const y2025 = nextDueAfter({ ...yearly, from: iso('2024-02-29') })
    const y2026 = nextDueAfter({ ...yearly, from: iso(y2025) })
    const y2027 = nextDueAfter({ ...yearly, from: iso(y2026) })
    const y2028 = nextDueAfter({ ...yearly, from: iso(y2027) })

    expect([y2025, y2026, y2027, y2028]).toEqual([
      '2025-02-28',
      '2026-02-28',
      '2027-02-28',
      '2028-02-29',
    ])
  })

  it('takes the day it lands on when no day is stored', () => {
    expect(nextDueAfter({ cadence: 'monthly', from: iso('2026-01-31') })).toBe('2026-02-28')
    // And then it has genuinely forgotten the 31st, because nothing stored it.
    expect(nextDueAfter({ cadence: 'monthly', from: iso('2026-02-28') })).toBe('2026-03-28')
  })

  it('refuses a date that is not a date', () => {
    expect(() => nextDueAfter({ cadence: 'monthly', from: iso('26-01-31') })).toThrow(RangeError)
  })
})

describe('firstDueOnOrAfter', () => {
  it('takes this month when the preferred day has not passed', () => {
    expect(
      firstDueOnOrAfter({ cadence: 'monthly', from: iso('2026-08-20'), dayOfMonth: 25 }),
    ).toBe('2026-08-25')
  })

  it('takes next month when it has', () => {
    expect(
      firstDueOnOrAfter({ cadence: 'monthly', from: iso('2026-08-20'), dayOfMonth: 1 }),
    ).toBe('2026-09-01')
  })

  it('takes today itself when today is the day', () => {
    expect(
      firstDueOnOrAfter({ cadence: 'monthly', from: iso('2026-08-20'), dayOfMonth: 20 }),
    ).toBe('2026-08-20')
  })

  it('walks a yearly template forward to the next time its month comes round', () => {
    expect(
      firstDueOnOrAfter({
        cadence: 'yearly',
        from: iso('2026-08-20'),
        dayOfMonth: 15,
        monthOfYear: 3,
      }),
    ).toBe('2027-03-15')
  })

  it('stays in this year when the yearly month is still ahead', () => {
    expect(
      firstDueOnOrAfter({
        cadence: 'yearly',
        from: iso('2026-08-20'),
        dayOfMonth: 15,
        monthOfYear: 11,
      }),
    ).toBe('2026-11-15')
  })

  it('clamps a 31st preference into a short month', () => {
    expect(
      firstDueOnOrAfter({ cadence: 'monthly', from: iso('2026-02-01'), dayOfMonth: 31 }),
    ).toBe('2026-02-28')
  })
})
