/**
 * Dates, with no timezone accidents.
 *
 * Every date the app stores is a Postgres `date`: a calendar day with no time
 * and no zone, arriving as `YYYY-MM-DD`. The one place a zone matters is
 * deciding which calendar day "today" is, and that is always Asia/Ho_Chi_Minh
 * regardless of where the browser thinks it is (docs/01-PRODUCT.md).
 *
 * Everything here works on the string, so a date never round-trips through a
 * Date object and comes back a day earlier.
 *
 * Nothing in this file imports date-fns, and that is deliberate. Turning a date
 * into words needs a locale's worth of month and weekday names — around eight
 * kilobytes gzipped — and a screen that only does calendar arithmetic should not
 * pay for it. The words live in `lib/dates-display.ts`, which every screen that
 * prints a date imports instead.
 */

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
 * Shift an ISO day by whole days.
 *
 * Done in UTC and formatted back by hand: a local `Date` would shift by an hour
 * across a daylight-saving boundary, and a day that is 23 hours long is exactly
 * how "yesterday" ends up being the day before yesterday.
 */
export function addDays(date: IsoDate, days: number): IsoDate {
  const parts = ISO_DATE.exec(date)
  if (!parts) throw new RangeError(`expected YYYY-MM-DD, got ${date}`)
  const shifted = new Date(
    Date.UTC(Number(parts[1]), Number(parts[2]) - 1, Number(parts[3]) + days),
  )
  return `${String(shifted.getUTCFullYear()).padStart(4, '0')}-${String(shifted.getUTCMonth() + 1).padStart(2, '0')}-${String(shifted.getUTCDate()).padStart(2, '0')}`
}
