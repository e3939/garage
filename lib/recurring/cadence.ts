/**
 * When a recurring template comes due next.
 *
 * A mirror of `next_recurrence_due` in migration 0017, in the same sense that
 * `amortiseSlices` mirrors `v_expense_impact`: the database is the
 * implementation — it is what the cron job runs — and this is the copy that lets
 * the template form say "next due 1 October" while somebody is still choosing a
 * cadence. `lib/recurring/cadence.db.test.ts` runs both over the same set of
 * dates and asserts they agree. If they ever do not, the function wins.
 *
 * The rule worth stating: the day of the month is stored, not carried. A
 * template due on the 31st lands on the 30th in April and comes back to the 31st
 * in May. Adding a month at a time to the last date would have walked it
 * permanently down to the 28th the first time it passed February.
 */

import type { IsoDate } from '@/lib/dates'
import type { Enums } from '@/lib/supabase/types'

export type Cadence = Enums<'recurrence'>

export const CADENCES: readonly Cadence[] = ['monthly', 'quarterly', 'yearly']

export const CADENCE_LABEL: Readonly<Record<Cadence, string>> = {
  monthly: 'Monthly',
  quarterly: 'Quarterly',
  yearly: 'Yearly',
}

/** How often it lands, in words, for the row under a template's name. */
export const CADENCE_DESCRIPTION: Readonly<Record<Cadence, string>> = {
  monthly: 'Every month',
  quarterly: 'Every three months',
  yearly: 'Once a year',
}

const CADENCE_MONTHS: Readonly<Record<Cadence, number>> = {
  monthly: 1,
  quarterly: 3,
  yearly: 12,
}

const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/

type Parts = { year: number; month: number; day: number }

function parse(date: IsoDate): Parts {
  const parts = ISO_DATE.exec(date)
  if (!parts) throw new RangeError(`expected YYYY-MM-DD, got ${date}`)
  return { year: Number(parts[1]), month: Number(parts[2]), day: Number(parts[3]) }
}

function iso({ year, month, day }: Parts): IsoDate {
  return `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
}

/** Day zero of the next month is the last day of this one, in UTC so it cannot drift. */
export function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate()
}

/**
 * Add whole months the way Postgres does: keep the day, and clamp it to the last
 * day of the month it lands in. 31 January plus one month is 28 February.
 */
function addMonths({ year, month, day }: Parts, months: number): Parts {
  const total = year * 12 + (month - 1) + months
  const nextYear = Math.floor(total / 12)
  const nextMonth = total - nextYear * 12 + 1
  return { year: nextYear, month: nextMonth, day: Math.min(day, daysInMonth(nextYear, nextMonth)) }
}

export type NextDueInput = {
  cadence: Cadence
  /** The due date being moved on from. */
  from: IsoDate
  /** The day the template prefers. Null keeps whatever day `from` lands on. */
  dayOfMonth?: number | null
  /** Yearly only. Null keeps the month `from` lands in. */
  monthOfYear?: number | null
}

export function nextDueAfter({
  cadence,
  from,
  dayOfMonth = null,
  monthOfYear = null,
}: NextDueInput): IsoDate {
  const base = addMonths(parse(from), CADENCE_MONTHS[cadence])

  // Only a yearly template can name its month. Every month is a monthly
  // template's month, and a quarterly one's month is set by where it started.
  const month = cadence === 'yearly' && monthOfYear !== null ? monthOfYear : base.month
  const day = Math.min(dayOfMonth ?? base.day, daysInMonth(base.year, month))

  return iso({ year: base.year, month, day })
}

/**
 * The first due date on or after a given day, for a template being created.
 *
 * Walks forward from the day itself rather than from an arbitrary anchor, so a
 * monthly template set up on the 20th with a preferred day of 1 comes due on the
 * 1st of next month, not tomorrow and not last month.
 */
export function firstDueOnOrAfter({
  cadence,
  from,
  dayOfMonth = null,
  monthOfYear = null,
}: NextDueInput): IsoDate {
  const start = parse(from)
  const month = cadence === 'yearly' && monthOfYear !== null ? monthOfYear : start.month
  let candidate = iso({
    year: start.year,
    month,
    day: Math.min(dayOfMonth ?? start.day, daysInMonth(start.year, month)),
  })

  // Twelve steps covers a year of monthly and a decade of yearly; nothing can
  // need more, and the bound is what stops a bad cadence spinning.
  for (let step = 0; candidate < from && step < 12; step += 1) {
    candidate = nextDueAfter({ cadence, from: candidate, dayOfMonth, monthOfYear })
  }

  return candidate
}
