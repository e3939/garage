import type { IsoDate } from '@/lib/dates'

/**
 * docs/01-PRODUCT.md, section D: "Due calculation uses whichever comes first.
 * States: ok, due soon, overdue."
 */
export type ServiceState = 'ok' | 'due_soon' | 'overdue'

export const SERVICE_STATE_LABEL: Readonly<Record<ServiceState, string>> = {
  ok: 'On schedule',
  due_soon: 'Due soon',
  overdue: 'Overdue',
}

/** The bucket vocabulary from docs/03-DESIGN.md, applied to urgency. */
export const SERVICE_STATE_COLOUR: Readonly<Record<ServiceState, string>> = {
  ok: 'var(--positive)',
  due_soon: 'var(--attention)',
  overdue: 'var(--critical)',
}

/**
 * One row of `v_service_due`.
 *
 * `basis` says what the interval was measured from. A schedule nobody has
 * marked done yet is measured from the day the car was taken on, because an
 * interval has to run from something and that is the only date the app knows —
 * but it is an estimate, and the screen says so rather than implying the car
 * was serviced that day.
 */
export type ServiceDue = {
  schedule_id: string
  vehicle_id: string
  name: string
  interval_km: number | null
  interval_months: number | null
  last_done_km: number | null
  last_done_on: IsoDate | null
  notes: string | null
  odometer_km: number
  basis: 'done' | 'purchase'
  basis_km: number
  basis_on: IsoDate
  due_km: number | null
  due_date: IsoDate | null
  km_remaining: number | null
  days_remaining: number | null
  km_fraction: number | null
  day_fraction: number | null
  /** How much of the interval is left, as the more urgent of the two axes. */
  remaining_fraction: number | null
  due_by: 'km' | 'date' | null
  state: ServiceState
  /** The view's own sortable rank: 0 overdue, 1 due soon, 2 on schedule. */
  urgency: number
}

/** One thing that was actually done to the car. */
export type ServiceRecord = {
  id: string
  vehicle_id: string
  schedule_id: string | null
  name: string
  performed_on: IsoDate
  odometer_km: number | null
  workshop: string | null
  notes: string | null
  expense_id: string | null
  amount: number | null
  currency: string | null
  photo_count: number
}

/** "Every 5,000 km or 6 months" — what the schedule says, not where it stands. */
export function intervalLabel(
  schedule: Pick<ServiceDue, 'interval_km' | 'interval_months'>,
  locale: string,
): string {
  const km =
    schedule.interval_km === null ? null : `${schedule.interval_km.toLocaleString(locale)} km`
  const months =
    schedule.interval_months === null
      ? null
      : schedule.interval_months === 1
        ? '1 month'
        : `${schedule.interval_months} months`

  if (km && months) return `Every ${km} or ${months}`
  return `Every ${km ?? months}`
}

/**
 * Where the schedule stands, in one line, naming the axis that decides it.
 *
 * Only the deciding axis is spoken. Saying both — "in 200 km or 144 days" —
 * reads as a choice, and it is not one: whichever comes first is the one that
 * governs, and the other is not information yet.
 */
export function dueSummary(due: ServiceDue, locale: string): string {
  const km = due.km_remaining
  const days = due.days_remaining

  if (km === null && days === null) return 'No interval set, so nothing comes due.'

  const byKm = due.due_by === 'km'
  const value = byKm ? km : days

  if (value === null) return 'No interval set, so nothing comes due.'

  if (value < 0) {
    const over = Math.abs(value)
    return byKm
      ? `Overdue by ${over.toLocaleString(locale)} km`
      : `Overdue by ${over} ${over === 1 ? 'day' : 'days'}`
  }

  if (value === 0) return byKm ? 'Due now' : 'Due today'

  return byKm
    ? `Due in ${value.toLocaleString(locale)} km`
    : `Due in ${value} ${value === 1 ? 'day' : 'days'}`
}

/**
 * What the gauge sweeps: how much of the interval has been used, 0 to 1.
 *
 * Clamped at both ends. Past due it sits full rather than wrapping around, and
 * a schedule freshly done sits empty rather than slightly negative because a
 * reading arrived before the record did.
 */
export function usedFraction(due: Pick<ServiceDue, 'remaining_fraction'>): number {
  if (due.remaining_fraction === null) return 0
  return Math.min(1, Math.max(0, 1 - due.remaining_fraction))
}

/**
 * The one item the vehicle home shows. Most urgent first: overdue before due
 * soon, then whichever has the least of its interval left.
 *
 * A schedule with no interval at all can never come due and is never the answer.
 */
export function mostUrgent(rows: readonly ServiceDue[]): ServiceDue | null {
  const ranked = rows
    .filter((row) => row.remaining_fraction !== null)
    .sort((a, b) => {
      if (a.urgency !== b.urgency) return a.urgency - b.urgency
      return (a.remaining_fraction ?? 1) - (b.remaining_fraction ?? 1)
    })

  return ranked[0] ?? null
}
