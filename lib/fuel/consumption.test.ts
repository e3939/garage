/**
 * Fuel economy. CLAUDE.md section 7 names this as one of the three places where
 * a silent bug costs real trust, so the numbers below were worked out on paper
 * before they were typed, and the working is in the comments.
 *
 * `lib/queries/fuel.db.test.ts` runs the same fills through
 * `v_fuel_consumption` and asserts the view agrees with every figure here.
 */

import { describe, expect, it } from 'vitest'

import {
  consumptionIntervals,
  kmPerL,
  lPer100km,
  round2,
  weightedConsumption,
  type Fill,
} from '@/lib/fuel/consumption'

let counter = 0

function fill(
  filled_on: string,
  odometer_km: number,
  litres: number,
  total_cost: number,
  options: Partial<Pick<Fill, 'is_full_tank' | 'missed_previous' | 'currency' | 'id'>> = {},
): Fill {
  counter += 1
  return {
    id: options.id ?? `fill-${String(counter).padStart(3, '0')}`,
    filled_on,
    odometer_km,
    litres,
    total_cost,
    currency: options.currency ?? 'VND',
    is_full_tank: options.is_full_tank ?? true,
    missed_previous: options.missed_previous ?? false,
  }
}

describe('the two ways of reading the same number', () => {
  it('turns 45 litres over 500 km into 9 L/100km', () => {
    expect(lPer100km(45, 500)).toBe(9)
  })

  it('turns the same fill into 11.11 km/L', () => {
    // 500 / 45 = 11.1111...
    expect(kmPerL(45, 500)).toBe(11.11)
  })

  it('rounds to two places, halves away from zero', () => {
    expect(round2(7.605)).toBe(7.61)
    expect(round2(7.604)).toBe(7.6)
    expect(lPer100km(32.5, 500)).toBe(6.5)
  })

  it('refuses a distance or a volume of nothing rather than returning an infinity', () => {
    expect(() => lPer100km(45, 0)).toThrow(RangeError)
    expect(() => kmPerL(0, 500)).toThrow(RangeError)
  })
})

describe('intervals between consecutive full tanks', () => {
  /**
   * The worked example, and the phase's acceptance criterion.
   *
   *   1 Feb  10,000 km  40.0 L  920,000 d  full     <- opens interval 1
   *   8 Feb  10,240 km  20.0 L  460,000 d  partial
   *  15 Feb  10,500 km  25.0 L  575,000 d  full     <- closes 1, opens 2
   *  28 Feb  11,000 km  32.5 L  747,500 d  full     <- closes 2, opens 3
   *
   * Interval 1: 10,500 - 10,000 = 500 km. Litres burned are the ones put in
   * *after* the tank was last full: 20 + 25 = 45. The opening 40 L is not in it
   * — that fuel is what the car ran on to reach 10,240, and it was measured by
   * the fill that replaced it.
   *   45 x 100 / 500 = 9.00 L/100km,  500 / 45 = 11.11 km/L
   *   460,000 + 575,000 = 1,035,000 d over 500 km = 2,070 d/km
   *
   * Interval 2: 11,000 - 10,500 = 500 km, 32.5 L.
   *   32.5 x 100 / 500 = 6.50 L/100km,  500 / 32.5 = 15.38 km/L
   */
  const fills = [
    fill('2026-02-01', 10_000, 40, 920_000),
    fill('2026-02-08', 10_240, 20, 460_000, { is_full_tank: false }),
    fill('2026-02-15', 10_500, 25, 575_000),
    fill('2026-02-28', 11_000, 32.5, 747_500),
  ]

  const intervals = consumptionIntervals(fills)

  it('produces one interval per pair of consecutive full tanks', () => {
    expect(intervals).toHaveLength(2)
  })

  it('accumulates the partial fill into the interval it belongs to', () => {
    expect(intervals[0]).toMatchObject({
      start_km: 10_000,
      end_km: 10_500,
      km: 500,
      litres: 45,
      fills: 2,
      l_per_100km: 9,
      km_per_l: 11.11,
      cost: 1_035_000,
      cost_per_km: 2070,
      cost_per_litre: 23_000,
    })
  })

  it('never counts the opening tank against the distance it was measured over', () => {
    expect(intervals[1]).toMatchObject({
      start_km: 10_500,
      end_km: 11_000,
      km: 500,
      litres: 32.5,
      l_per_100km: 6.5,
      km_per_l: 15.38,
    })
  })

  it('keys each interval by the fill that closed it', () => {
    expect(intervals[0]?.end_fuel_log_id).toBe(fills[2]?.id)
    expect(intervals[0]?.started_on).toBe('2026-02-01')
    expect(intervals[0]?.ended_on).toBe('2026-02-15')
  })
})

describe('the chain, and the honest ways it breaks', () => {
  it('skips the whole interval a missed fill sits in, not just that fill', () => {
    // 11,000 -> 11,400 would be 30 L over 400 km = 7.50, but the closing fill
    // says a fill-up went unlogged, so the litres do not account for the km.
    const intervals = consumptionIntervals([
      fill('2026-02-28', 11_000, 32.5, 747_500),
      fill('2026-03-10', 11_400, 30, 690_000, { missed_previous: true }),
      fill('2026-03-22', 11_900, 38, 874_000),
    ])

    expect(intervals).toHaveLength(1)
    expect(intervals[0]).toMatchObject({ start_km: 11_400, end_km: 11_900, litres: 38 })
  })

  it('produces nothing from a log that has never seen two full tanks', () => {
    expect(consumptionIntervals([fill('2026-02-01', 10_000, 40, 920_000)])).toHaveLength(0)
    expect(
      consumptionIntervals([
        fill('2026-02-01', 10_000, 40, 920_000),
        fill('2026-02-08', 10_240, 20, 460_000, { is_full_tank: false }),
      ]),
    ).toHaveLength(0)
  })

  it('holds an open interval back until a full tank closes it', () => {
    const running = [
      fill('2026-02-01', 10_000, 40, 920_000),
      fill('2026-02-08', 10_240, 20, 460_000, { is_full_tank: false }),
      fill('2026-02-12', 10_390, 15, 345_000, { is_full_tank: false }),
    ]
    expect(consumptionIntervals(running)).toHaveLength(0)

    const closed = [...running, fill('2026-02-15', 10_500, 25, 575_000)]
    // 20 + 15 + 25 = 60 L over 500 km = 12.00 L/100km
    expect(consumptionIntervals(closed)[0]).toMatchObject({ litres: 60, l_per_100km: 12, fills: 3 })
  })

  it('drops an interval that covers no distance rather than dividing by zero', () => {
    expect(
      consumptionIntervals([
        fill('2026-02-01', 10_000, 40, 920_000),
        fill('2026-02-02', 10_000, 5, 115_000),
      ]),
    ).toHaveLength(0)
  })

  it('reads the fills in the order they happened, whatever order they arrive in', () => {
    const shuffled = [
      fill('2026-02-15', 10_500, 25, 575_000, { id: 'c' }),
      fill('2026-02-01', 10_000, 40, 920_000, { id: 'a' }),
      fill('2026-02-08', 10_240, 20, 460_000, { is_full_tank: false, id: 'b' }),
    ]
    expect(consumptionIntervals(shuffled)[0]).toMatchObject({ km: 500, litres: 45 })
  })

  it('computes consumption but not cost when an interval mixes currencies', () => {
    const intervals = consumptionIntervals([
      fill('2026-02-01', 10_000, 40, 920_000),
      fill('2026-02-08', 10_240, 20, 20_00, { is_full_tank: false, currency: 'USD' }),
      fill('2026-02-15', 10_500, 25, 575_000),
    ])

    expect(intervals[0]?.l_per_100km).toBe(9)
    expect(intervals[0]?.cost).toBeNull()
    expect(intervals[0]?.cost_per_km).toBeNull()
  })
})

describe('the rolling three-interval average', () => {
  it('averages what exists until there are three of them', () => {
    // 9.00, then 6.50, then 7.60.
    //   9.00
    //  (9.00 + 6.50) / 2 = 7.75
    //  (9.00 + 6.50 + 7.60) / 3 = 23.10 / 3 = 7.70
    const intervals = consumptionIntervals([
      fill('2026-02-01', 10_000, 40, 920_000),
      fill('2026-02-08', 10_240, 20, 460_000, { is_full_tank: false }),
      fill('2026-02-15', 10_500, 25, 575_000),
      fill('2026-02-28', 11_000, 32.5, 747_500),
      fill('2026-03-22', 11_500, 38, 874_000),
    ])

    expect(intervals.map((interval) => interval.rolling3_l_per_100km)).toEqual([9, 7.75, 7.7])
  })

  it('forgets the fourth interval back', () => {
    const intervals = consumptionIntervals([
      fill('2026-01-01', 10_000, 50, 1_150_000),
      fill('2026-01-11', 10_500, 50, 1_150_000), // 10.00
      fill('2026-01-21', 11_000, 40, 920_000), //  8.00
      fill('2026-01-31', 11_500, 30, 690_000), //  6.00
      fill('2026-02-10', 12_000, 20, 460_000), //  4.00
    ])

    // The last window is 8, 6, 4 -> 6.00. The opening 10 has dropped out.
    expect(intervals.map((interval) => interval.rolling3_l_per_100km)).toEqual([10, 9, 8, 6])
  })
})

describe('lifetime consumption', () => {
  it('weights by litres rather than averaging the ratios', () => {
    // A 40km splash at 15 L/100km and a 600km run at 6 L/100km.
    //   litres 6 + 36 = 42 over 640 km = 6.5625 -> 6.56 L/100km
    // The mean of the two ratios would be 10.50, which is not what the car did.
    const summary = weightedConsumption([
      { km: 40, litres: 6 },
      { km: 600, litres: 36 },
    ])

    expect(summary).toMatchObject({ km: 640, litres: 42, l_per_100km: 6.56 })
    expect(summary.km_per_l).toBe(15.24)
  })

  it('has no opinion about a log with nothing measured in it', () => {
    expect(weightedConsumption([])).toMatchObject({ l_per_100km: null, km_per_l: null })
  })
})
