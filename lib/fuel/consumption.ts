/**
 * Fuel economy, computed the one way this app computes it.
 *
 * `v_fuel_consumption` is where the numbers on the screen come from — CLAUDE.md
 * section 3 says aggregate in SQL, and it does. This module is the same rule
 * written as pure functions, and it exists for two reasons:
 *
 *   1. CLAUDE.md section 7 asks for tests on fuel-economy calculations, "where a
 *      silent bug costs real trust". A view cannot be unit-tested; this can, and
 *      `lib/fuel/consumption.test.ts` walks it through fills whose answers were
 *      worked out on paper first.
 *   2. `lib/queries/fuel.db.test.ts` runs the same fixtures through the view and
 *      asserts the two agree exactly. That is the same arrangement `lib/budget.ts`
 *      has with `v_expense_impact`: one implementation is the source of truth,
 *      the other is the thing that proves it did not drift.
 *
 * The rule itself is docs/02-DATA-MODEL.md:
 *
 *   litres_consumed = sum(litres of fills after the earlier full tank, up to and
 *                     including the later one)
 *   distance        = later.odometer_km - earlier.odometer_km
 *   Skip any interval where missed_previous is true.
 *
 * Consumption is a property of a *closed* interval. A tank you have not filled
 * to the top again is a tank whose remaining fuel nobody has measured, so
 * partial fills accumulate forward and no figure is produced until the next full
 * tank closes the window.
 */

import type { IsoDate } from '@/lib/dates'

/** One fill-up, as much of it as consumption depends on. */
export type Fill = {
  id: string
  filled_on: IsoDate
  odometer_km: number
  litres: number
  total_cost: number
  currency: string
  is_full_tank: boolean
  missed_previous: boolean
}

/** One completed full-tank-to-full-tank interval. */
export type ConsumptionInterval = {
  /** The fill that closed the interval. The row is keyed by it. */
  end_fuel_log_id: string
  started_on: IsoDate
  ended_on: IsoDate
  start_km: number
  end_km: number
  km: number
  litres: number
  /** How many fills were burned through in the window, the closer included. */
  fills: number
  currency: string
  /** Null when the fills in the window are not all in one currency. */
  cost: number | null
  l_per_100km: number
  km_per_l: number
  cost_per_km: number | null
  cost_per_litre: number | null
  /** This interval and the two before it. Fewer than three averages what exists. */
  rolling3_l_per_100km: number
}

/** Two decimal places, halves away from zero — the same rule `round()` uses in SQL. */
export function round2(value: number): number {
  return Math.round(value * 100 + (value < 0 ? -1e-9 : 1e-9)) / 100
}

/** Whole minor units, halves away from zero. Money never carries a fraction. */
function roundMinor(value: number): number {
  return value < 0 ? -Math.round(-value) : Math.round(value)
}

/** Litres per hundred kilometres. The habit most of the world reads. */
export function lPer100km(litres: number, km: number): number {
  if (km <= 0) throw new RangeError(`distance must be positive, got ${String(km)}`)
  return round2((litres * 100) / km)
}

/** Kilometres per litre. The other habit, shown next to it rather than instead. */
export function kmPerL(litres: number, km: number): number {
  if (litres <= 0) throw new RangeError(`litres must be positive, got ${String(litres)}`)
  return round2(km / litres)
}

/**
 * Chronological order, which is the order the fills happened in. The odometer is
 * a reading, not a clock, so it breaks ties within a day rather than leading.
 */
function chronological(a: Fill, b: Fill): number {
  if (a.filled_on !== b.filled_on) return a.filled_on < b.filled_on ? -1 : 1
  if (a.odometer_km !== b.odometer_km) return a.odometer_km - b.odometer_km
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0
}

/**
 * Every completed interval in a vehicle's fill log, oldest first.
 *
 * The grouping is the whole trick, and it is the same one the view uses: number
 * each fill by how many full tanks came strictly before it, and each group is
 * exactly one interval — the partials after full tank k, closed by full tank
 * k+1, which is always the last row in its group because passing it is what
 * increments the counter.
 *
 * Group 0 has no earlier full tank to measure from and a trailing group has
 * nothing to close it; both are dropped. So is an interval that covers no
 * distance, which is a typo rather than a car that used fuel standing still.
 */
export function consumptionIntervals(fills: readonly Fill[]): ConsumptionInterval[] {
  const ordered = [...fills].sort(chronological)

  /** Fills grouped by how many full tanks preceded them. */
  const groups: Fill[][] = []
  let priorFulls = 0
  for (const fill of ordered) {
    const group = (groups[priorFulls] ??= [])
    group.push(fill)
    if (fill.is_full_tank) priorFulls += 1
  }

  const intervals: ConsumptionInterval[] = []
  const recent: number[] = []

  for (let index = 1; index < groups.length; index += 1) {
    const group = groups[index]
    const opener = groups[index - 1]?.at(-1)
    const closer = group?.at(-1)
    if (!group || !opener || !closer || !closer.is_full_tank || !opener.is_full_tank) continue

    // The flag means litres were burned that nobody logged, so the litres in
    // this window do not account for the distance in it. The interval is not
    // wrong by a little; it is unknowable, and the honest thing is to skip it.
    if (group.some((fill) => fill.missed_previous)) continue

    const km = closer.odometer_km - opener.odometer_km
    const litres = round3(group.reduce((total, fill) => total + fill.litres, 0))
    if (km <= 0 || litres <= 0) continue

    const currencies = new Set(group.map((fill) => fill.currency))
    const cost =
      currencies.size === 1 ? group.reduce((total, fill) => total + fill.total_cost, 0) : null

    const consumption = lPer100km(litres, km)
    recent.push((litres * 100) / km)
    if (recent.length > 3) recent.shift()

    intervals.push({
      end_fuel_log_id: closer.id,
      started_on: opener.filled_on,
      ended_on: closer.filled_on,
      start_km: opener.odometer_km,
      end_km: closer.odometer_km,
      km,
      litres,
      fills: group.length,
      currency: closer.currency,
      cost,
      l_per_100km: consumption,
      km_per_l: kmPerL(litres, km),
      cost_per_km: cost === null ? null : roundMinor(cost / km),
      cost_per_litre: cost === null ? null : roundMinor(cost / litres),
      rolling3_l_per_100km: round2(recent.reduce((a, b) => a + b, 0) / recent.length),
    })
  }

  return intervals
}

/** `numeric(8,3)` is what the column holds, so litres add up to three places. */
function round3(value: number): number {
  return Math.round(value * 1000 + 1e-6) / 1000
}

/**
 * Lifetime consumption across a set of intervals: total litres over total
 * distance, not the mean of the per-interval figures.
 *
 * A mean of ratios gives a 40km splash-and-dash the same say as a 600km
 * motorway run, which is how a fuel log ends up disagreeing with the arithmetic
 * somebody did on the back of the receipt.
 */
export function weightedConsumption(
  intervals: readonly Pick<ConsumptionInterval, 'km' | 'litres'>[],
): { km: number; litres: number; l_per_100km: number | null; km_per_l: number | null } {
  const km = intervals.reduce((total, interval) => total + interval.km, 0)
  const litres = round3(intervals.reduce((total, interval) => total + interval.litres, 0))

  return {
    km,
    litres,
    l_per_100km: km > 0 ? lPer100km(litres, km) : null,
    km_per_l: litres > 0 ? kmPerL(litres, km) : null,
  }
}
