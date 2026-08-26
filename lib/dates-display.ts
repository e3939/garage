/**
 * Dates in words.
 *
 * Split out of `lib/dates.ts` on purpose. `date-fns`'s `format` carries a
 * locale's month names, weekday names and era names with it — around eight
 * kilobytes gzipped — and it lands in the client bundle of anything that so much
 * as imports the module it lives in. The garage list does calendar arithmetic
 * and prints no dates at all; before this split it paid for the words anyway.
 *
 * Everything here takes an ISO calendar day and returns a string. Nothing here
 * does arithmetic that could move a date across a day boundary.
 */

import { format, parseISO } from 'date-fns'

import {
  addDays,
  addMonthsToMonthStart,
  isIsoDate,
  todayIso,
  type IsoDate,
} from '@/lib/dates'

/**
 * `date-fns` parses a date-only string as local midnight, so formatting it back
 * always yields the same calendar day whatever the browser's zone is.
 */
function toDate(date: IsoDate): Date {
  if (!isIsoDate(date)) throw new RangeError(`expected YYYY-MM-DD, got ${date}`)
  return parseISO(date)
}

/** "August" — the month name used by the budget-impact switch. */
export function monthName(date: IsoDate): string {
  return format(toDate(date), 'LLLL')
}

/** "August 2026" — the month name with a year, for headings. */
export function monthLabel(date: IsoDate): string {
  return format(toDate(date), 'LLLL yyyy')
}

/** "25 Aug 2026" — a plain date, for detail rows. */
export function dateLabel(date: IsoDate): string {
  return format(toDate(date), 'd LLL yyyy')
}

/**
 * A day heading, in the ledger and in the build log. Today and yesterday are
 * named; everything else gets a weekday and a date, with the year only when it
 * is not the current one.
 */
export function dayHeading(date: IsoDate, today: IsoDate = todayIso()): string {
  if (date === today) return 'Today'
  if (date === addDays(today, -1)) return 'Yesterday'
  const sameYear = date.slice(0, 4) === today.slice(0, 4)
  return format(toDate(date), sameYear ? 'EEE d LLL' : 'EEE d LLL yyyy')
}

/**
 * A run of month names starting at a month, keyed by month start.
 *
 * Handed to client components that need to print a month they will only work
 * out in the browser — the fund sheet's projected completion date moves as the
 * target is typed. The alternative is `date-fns` in the client bundle for the
 * sake of twelve words. Five years is enough for any fund somebody is seriously
 * contributing to; past that the sheet says "N months from now" instead.
 */
export function monthLabelsFrom(start: IsoDate, count: number): Record<string, string> {
  const labels: Record<string, string> = {}
  for (let index = 0; index < count; index += 1) {
    const month = addMonthsToMonthStart(start, index)
    labels[month] = monthLabel(month)
  }
  return labels
}
