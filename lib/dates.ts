/**
 * Dates, with no timezone accidents.
 *
 * Every date the app stores is a Postgres `date`: a calendar day with no time
 * and no zone, arriving as `YYYY-MM-DD`. The one place a zone matters is
 * deciding which calendar day "today" is, and that is always Asia/Ho_Chi_Minh
 * regardless of where the browser thinks it is (docs/01-PRODUCT.md).
 *
 * Everything else here works on the string, so a date never round-trips through
 * a Date object and comes back a day earlier.
 */

import { format, parseISO } from 'date-fns'

export const APP_TIMEZONE = 'Asia/Ho_Chi_Minh'

/** An ISO calendar day, `YYYY-MM-DD`. */
export type IsoDate = string

const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/

export function isIsoDate(value: string): boolean {
  return ISO_DATE.test(value)
}

/**
 * `en-CA` formats as `YYYY-MM-DD`, which is the shape Postgres wants, so the
 * calendar day in Ho Chi Minh City falls out of Intl without any arithmetic.
 */
const ISO_IN_APP_TZ = new Intl.DateTimeFormat('en-CA', {
  timeZone: APP_TIMEZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
})

/** Today's calendar day in the app's timezone. */
export function todayIso(now: Date = new Date()): IsoDate {
  return ISO_IN_APP_TZ.format(now)
}

/** The first of the month an ISO date falls in. */
export function monthStart(date: IsoDate): IsoDate {
  const parts = ISO_DATE.exec(date)
  if (!parts) throw new RangeError(`expected YYYY-MM-DD, got ${date}`)
  return `${parts[1]}-${parts[2]}-01`
}

/** Add whole months to a date's month start. Used for amortisation ranges. */
export function addMonthsToMonthStart(date: IsoDate, months: number): IsoDate {
  const parts = ISO_DATE.exec(date)
  if (!parts) throw new RangeError(`expected YYYY-MM-DD, got ${date}`)
  const total = Number(parts[1]) * 12 + (Number(parts[2]) - 1) + months
  const year = Math.floor(total / 12)
  const month = total - year * 12 + 1
  return `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-01`
}

/**
 * `date-fns` parses a date-only string as local midnight, so formatting it back
 * always yields the same calendar day whatever the browser's zone is.
 */
function toDate(date: IsoDate): Date {
  if (!ISO_DATE.test(date)) throw new RangeError(`expected YYYY-MM-DD, got ${date}`)
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
 * The ledger's day heading. Today and yesterday are named; everything else gets
 * a weekday and a date, with the year only when it is not the current one.
 */
export function dayHeading(date: IsoDate, today: IsoDate = todayIso()): string {
  if (date === today) return 'Today'
  if (date === addDays(today, -1)) return 'Yesterday'
  const sameYear = date.slice(0, 4) === today.slice(0, 4)
  return format(toDate(date), sameYear ? 'EEE d LLL' : 'EEE d LLL yyyy')
}

/** Shift an ISO day by whole days. */
export function addDays(date: IsoDate, days: number): IsoDate {
  const base = toDate(date)
  base.setDate(base.getDate() + days)
  return format(base, 'yyyy-MM-dd')
}
