/**
 * Integration checks for maintenance, fuel and parts, against the local stack.
 *
 * The phase's acceptance criterion is arithmetic — "consumption between two full
 * tanks matches a hand calculation exactly" — so that is what most of this file
 * is. The same fills are run through `v_fuel_consumption` and through
 * `lib/fuel/consumption.ts`, and both are checked against numbers worked out on
 * paper in `lib/fuel/consumption.test.ts`. If the view and the module ever
 * disagree, one of them has drifted and this fails.
 *
 * The rest proves the two triggers docs/02-DATA-MODEL.md promises, the due
 * calculation, the negative sale expense, and that none of it is visible to
 * anybody else.
 *
 * Skipped unless GARAGE_DB_TESTS is set, so `npm test` stays hermetic.
 * Run with `npm run test:db`.
 */

import { beforeAll, describe, expect, it } from 'vitest'

import { DB_TESTS_ENABLED, readStack, type Stack } from '@/lib/supabase/test-stack'

import { consumptionIntervals, type Fill } from '@/lib/fuel/consumption'


type User = { id: string; token: string }

let stack: Stack
let user: User
let stranger: User

async function createUser(prefix: string): Promise<User> {
  const email = `${prefix}-${Math.random().toString(36).slice(2, 10)}@garage.test`
  const password = `probe-${Math.random().toString(36).slice(2, 12)}`

  const created = await fetch(`${stack.apiUrl}/auth/v1/admin/users`, {
    method: 'POST',
    headers: {
      apikey: stack.secretKey,
      authorization: `Bearer ${stack.secretKey}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify({ email, password, email_confirm: true }),
  })
  if (!created.ok) throw new Error(`create user failed: ${await created.text()}`)
  const { id } = (await created.json()) as { id: string }

  const signedIn = await fetch(`${stack.apiUrl}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: { apikey: stack.publishableKey, 'content-type': 'application/json' },
    body: JSON.stringify({ email, password }),
  })
  if (!signedIn.ok) throw new Error(`sign in failed: ${await signedIn.text()}`)
  const { access_token: token } = (await signedIn.json()) as { access_token: string }

  return { id, token }
}

async function call(as: User, path: string, init: RequestInit = {}): Promise<Response> {
  return fetch(`${stack.apiUrl}/rest/v1/${path}`, {
    ...init,
    headers: {
      apikey: stack.publishableKey,
      authorization: `Bearer ${as.token}`,
      'content-type': 'application/json',
      prefer: 'return=representation',
      ...(init.headers ?? {}),
    },
  })
}

async function rest(path: string, init: RequestInit = {}): Promise<unknown> {
  const response = await call(user, path, init)
  const text = await response.text()
  if (!response.ok) throw new Error(`${path} failed: ${response.status} ${text}`)
  return text === '' ? [] : JSON.parse(text)
}

/** The calendar day the database thinks it is, in the app's timezone. */
function appToday(): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Ho_Chi_Minh',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date())
}

function shiftDays(date: string, days: number): string {
  const [y, m, d] = date.split('-').map(Number)
  const shifted = new Date(Date.UTC(y ?? 1970, (m ?? 1) - 1, (d ?? 1) + days))
  return shifted.toISOString().slice(0, 10)
}

// ---------------------------------------------------------------------------
// The fixture.
//
// One car bought at 30,000km forty days ago and now reading 34,800km, plus the
// six fill-ups from `lib/fuel/consumption.test.ts` so the two suites are testing
// the same arithmetic with the same numbers.
// ---------------------------------------------------------------------------

const TODAY = appToday()
const PURCHASED = shiftDays(TODAY, -40)

type FillFixture = Omit<Fill, 'id' | 'currency'> & { currency?: string }

const FILLS: FillFixture[] = [
  { filled_on: '2026-02-01', odometer_km: 10_000, litres: 40, total_cost: 920_000, is_full_tank: true, missed_previous: false },
  { filled_on: '2026-02-08', odometer_km: 10_240, litres: 20, total_cost: 460_000, is_full_tank: false, missed_previous: false },
  { filled_on: '2026-02-15', odometer_km: 10_500, litres: 25, total_cost: 575_000, is_full_tank: true, missed_previous: false },
  { filled_on: '2026-02-28', odometer_km: 11_000, litres: 32.5, total_cost: 747_500, is_full_tank: true, missed_previous: false },
  { filled_on: '2026-03-10', odometer_km: 11_400, litres: 30, total_cost: 690_000, is_full_tank: true, missed_previous: true },
  { filled_on: '2026-03-22', odometer_km: 11_900, litres: 38, total_cost: 874_000, is_full_tank: true, missed_previous: false },
]

let vehicleId: string
let strangerVehicleId: string
let oilScheduleId: string
let modId: string

type DueRow = {
  schedule_id: string
  name: string
  interval_km: number | null
  interval_months: number | null
  last_done_km: number | null
  last_done_on: string | null
  odometer_km: number
  basis: string
  basis_km: number
  basis_on: string
  due_km: number | null
  due_date: string | null
  km_remaining: number | null
  days_remaining: number | null
  remaining_fraction: number | null
  due_by: string | null
  state: string
  urgency: number
}

async function due(name?: string): Promise<DueRow[]> {
  const filter = name ? `&name=eq.${encodeURIComponent(name)}` : ''
  return (await rest(
    `v_service_due?vehicle_id=eq.${vehicleId}${filter}&select=*&order=urgency.asc,remaining_fraction.asc`,
  )) as DueRow[]
}

/**
 * `numeric` comes back over PostgREST as an unquoted JSON number — `45.000` —
 * which `JSON.parse` reads as 45. So every figure here is compared as a number,
 * and trailing zeroes are not part of the assertion.
 */
type IntervalRow = {
  end_fuel_log_id: string
  started_on: string
  ended_on: string
  start_km: number
  end_km: number
  km: number
  litres: number
  fills: number
  currency: string
  cost: number | null
  l_per_100km: number
  km_per_l: number
  cost_per_km: number | null
  cost_per_litre: number | null
  rolling3_l_per_100km: number
}

describe.skipIf(!DB_TESTS_ENABLED)('Phase 6 maintenance, fuel and parts', () => {
  beforeAll(async () => {
    stack = readStack()
    user = await createUser('records')
    stranger = await createUser('records-stranger')

    const vehicles = (await rest('vehicles', {
      method: 'POST',
      body: JSON.stringify([
        {
          user_id: user.id,
          nickname: 'Records probe',
          purchase_date: PURCHASED,
          purchase_odometer_km: 30_000,
          odometer_km: 30_000,
          sort_order: 0,
        },
      ]),
    })) as { id: string }[]
    vehicleId = vehicles[0]!.id

    const strangerVehicles = await call(stranger, 'vehicles', {
      method: 'POST',
      body: JSON.stringify([{ user_id: stranger.id, nickname: 'Not yours', odometer_km: 1000 }]),
    })
    strangerVehicleId = ((await strangerVehicles.json()) as { id: string }[])[0]!.id

    const mods = (await rest('mod_plans', {
      method: 'POST',
      body: JSON.stringify([
        {
          user_id: user.id,
          vehicle_id: vehicleId,
          title: 'Intake',
          status: 'installed',
          installed_on: '2026-03-01',
        },
      ]),
    })) as { id: string }[]
    modId = mods[0]!.id

    await rest('fuel_logs', {
      method: 'POST',
      body: JSON.stringify(
        FILLS.map((fill) => ({
          user_id: user.id,
          vehicle_id: vehicleId,
          filled_on: fill.filled_on,
          odometer_km: fill.odometer_km,
          litres: fill.litres,
          total_cost: fill.total_cost,
          currency: fill.currency ?? null,
          is_full_tank: fill.is_full_tank,
          missed_previous: fill.missed_previous,
          station: null,
        })),
      ),
    })

    // The odometer trigger from 0012 has now raised the car to 11,900. Push it
    // to 34,800 so the service maths has a realistic distance to work with.
    await rest(`vehicles?id=eq.${vehicleId}`, {
      method: 'PATCH',
      body: JSON.stringify({ odometer_km: 34_800 }),
    })

    const schedules = (await rest(
      `service_schedules?vehicle_id=eq.${vehicleId}&name=eq.Engine%20oil%20%2B%20filter&select=id`,
    )) as { id: string }[]
    oilScheduleId = schedules[0]?.id ?? ''
  })

  // -------------------------------------------------------------------------
  // Seeded schedules
  // -------------------------------------------------------------------------

  describe('a new vehicle arrives with a service book', () => {
    it('has the seven intervals from docs/01-PRODUCT.md, and no more', async () => {
      const rows = (await rest(
        `service_schedules?vehicle_id=eq.${vehicleId}&select=name,interval_km,interval_months&order=interval_km.asc.nullslast`,
      )) as { name: string; interval_km: number | null; interval_months: number | null }[]

      expect(rows).toHaveLength(7)
      expect(new Map(rows.map((row) => [row.name, [row.interval_km, row.interval_months]]))).toEqual(
        new Map([
          ['Engine oil + filter', [5000, 6]],
          ['Air filter', [15_000, 12]],
          ['Brake fluid', [null, 24]],
          ['Coolant', [40_000, 24]],
          ['Spark plugs', [40_000, null]],
          ['Transmission fluid', [60_000, null]],
          ['Tyre rotation', [10_000, null]],
        ]),
      )
    })

    it('leaves last_done empty, because nothing has been done', async () => {
      const rows = (await rest(
        `service_schedules?vehicle_id=eq.${vehicleId}&select=last_done_km,last_done_on`,
      )) as { last_done_km: number | null; last_done_on: string | null }[]

      expect(rows.every((row) => row.last_done_km === null && row.last_done_on === null)).toBe(true)
    })
  })

  // -------------------------------------------------------------------------
  // v_service_due
  // -------------------------------------------------------------------------

  describe('v_service_due', () => {
    it('measures an unserviced schedule from the day the car was taken on', async () => {
      const [oil] = await due('Engine oil + filter')

      // Bought at 30,000km, oil every 5,000km, so it is due at 35,000 and the
      // clock reads 34,800: 200km left. Bought 40 days ago, six months is
      // roughly 183 days, so 143-ish days left. Kilometres come first.
      expect(oil?.basis).toBe('purchase')
      expect(oil?.basis_km).toBe(30_000)
      expect(oil?.basis_on).toBe(PURCHASED)
      expect(oil?.due_km).toBe(35_000)
      expect(oil?.km_remaining).toBe(200)
      expect(oil?.due_by).toBe('km')
      expect(oil?.state).toBe('due_soon')
    })

    it('gives a time-only schedule no kilometre figures at all', async () => {
      const [brakes] = await due('Brake fluid')

      expect(brakes?.due_km).toBeNull()
      expect(brakes?.km_remaining).toBeNull()
      expect(brakes?.due_by).toBe('date')
      expect(brakes?.state).toBe('ok')
    })

    it('gives a distance-only schedule no date figures at all', async () => {
      const [plugs] = await due('Spark plugs')

      expect(plugs?.due_date).toBeNull()
      expect(plugs?.days_remaining).toBeNull()
      expect(plugs?.due_by).toBe('km')
    })

    it('ranks the most pressing item first, by state before fraction', async () => {
      const rows = await due()
      expect(rows[0]?.name).toBe('Engine oil + filter')
      expect(rows.map((row) => row.urgency)).toEqual([...rows.map((row) => row.urgency)].sort())
    })

    it('calls an item overdue once either axis is past', async () => {
      await rest(`vehicles?id=eq.${vehicleId}`, {
        method: 'PATCH',
        body: JSON.stringify({ odometer_km: 35_400 }),
      })

      const [oil] = await due('Engine oil + filter')
      expect(oil?.km_remaining).toBe(-400)
      expect(oil?.state).toBe('overdue')
      expect(oil?.urgency).toBe(0)

      await rest(`vehicles?id=eq.${vehicleId}`, {
        method: 'PATCH',
        body: JSON.stringify({ odometer_km: 34_800 }),
      })
    })
  })

  // -------------------------------------------------------------------------
  // The roll-up trigger
  // -------------------------------------------------------------------------

  describe('a service record rolls up into its schedule', () => {
    let recordId: string

    it('moves last_done_* when the record is written', async () => {
      const records = (await rest('service_records', {
        method: 'POST',
        body: JSON.stringify([
          {
            user_id: user.id,
            vehicle_id: vehicleId,
            schedule_id: oilScheduleId,
            name: 'Engine oil + filter',
            performed_on: shiftDays(TODAY, -7),
            odometer_km: 34_500,
          },
        ]),
      })) as { id: string }[]
      recordId = records[0]!.id

      const [oil] = await due('Engine oil + filter')
      expect(oil?.basis).toBe('done')
      expect(oil?.last_done_km).toBe(34_500)
      expect(oil?.due_km).toBe(39_500)
      expect(oil?.km_remaining).toBe(4700)
      expect(oil?.state).toBe('ok')
    })

    it('is not dragged backwards by a back-dated record', async () => {
      await rest('service_records', {
        method: 'POST',
        body: JSON.stringify([
          {
            user_id: user.id,
            vehicle_id: vehicleId,
            schedule_id: oilScheduleId,
            name: 'Engine oil + filter, forgotten',
            performed_on: shiftDays(TODAY, -200),
            odometer_km: 29_000,
          },
        ]),
      })

      const [oil] = await due('Engine oil + filter')
      expect(oil?.last_done_km).toBe(34_500)
      expect(oil?.last_done_on).toBe(shiftDays(TODAY, -7))
    })

    it('goes back to never-done when every record is deleted', async () => {
      await rest(`service_records?schedule_id=eq.${oilScheduleId}`, { method: 'DELETE' })

      const [oil] = await due('Engine oil + filter')
      expect(oil?.last_done_km).toBeNull()
      expect(oil?.last_done_on).toBeNull()
      expect(oil?.basis).toBe('purchase')
    })

    it('keeps the km axis when the newest record carries no odometer', async () => {
      await rest('service_records', {
        method: 'POST',
        body: JSON.stringify([
          {
            user_id: user.id,
            vehicle_id: vehicleId,
            schedule_id: oilScheduleId,
            name: 'Oil, with a reading',
            performed_on: shiftDays(TODAY, -30),
            odometer_km: 34_000,
          },
          {
            user_id: user.id,
            vehicle_id: vehicleId,
            schedule_id: oilScheduleId,
            name: 'Oil, invoice with no reading on it',
            performed_on: shiftDays(TODAY, -5),
            odometer_km: null,
          },
        ]),
      })

      const [oil] = await due('Engine oil + filter')
      expect(oil?.last_done_km).toBe(34_000)
      expect(oil?.last_done_on).toBe(shiftDays(TODAY, -5))

      expect(recordId).toBeTruthy()
      await rest(`service_records?schedule_id=eq.${oilScheduleId}`, { method: 'DELETE' })
    })

    it('leaves an archived schedule out of the view entirely', async () => {
      await rest(`service_schedules?id=eq.${oilScheduleId}`, {
        method: 'PATCH',
        body: JSON.stringify({ archived_at: new Date().toISOString() }),
      })

      expect(await due('Engine oil + filter')).toHaveLength(0)

      await rest(`service_schedules?id=eq.${oilScheduleId}`, {
        method: 'PATCH',
        body: JSON.stringify({ archived_at: null }),
      })
    })
  })

  // -------------------------------------------------------------------------
  // v_fuel_consumption — the acceptance criterion
  // -------------------------------------------------------------------------

  describe('v_fuel_consumption', () => {
    let rows: IntervalRow[]

    beforeAll(async () => {
      rows = (await rest(
        `v_fuel_consumption?vehicle_id=eq.${vehicleId}&select=*&order=ended_on.asc,end_km.asc`,
      )) as IntervalRow[]
    })

    it('matches the hand calculation exactly', () => {
      // 10,000 -> 10,500 is 500km. The litres burned over it are the ones put in
      // after the tank was last full: 20 + 25 = 45. 45 x 100 / 500 = 9.00, and
      // 500 / 45 = 11.11. Money: 460,000 + 575,000 = 1,035,000 over 500km,
      // which is 2,070 a kilometre and 23,000 a litre.
      expect(rows[0]).toMatchObject({
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

      // 10,500 -> 11,000, one 32.5L fill. 32.5 x 100 / 500 = 6.50, 500 / 32.5 = 15.38.
      expect(rows[1]).toMatchObject({ km: 500, litres: 32.5, l_per_100km: 6.5, km_per_l: 15.38 })

      // 11,400 -> 11,900, 38L. 38 x 100 / 500 = 7.60.
      expect(rows[2]).toMatchObject({ start_km: 11_400, km: 500, l_per_100km: 7.6 })
    })

    it('skips the interval a missed fill-up sits in', () => {
      // 11,000 -> 11,400 would have been 30L over 400km. It is simply not here.
      expect(rows).toHaveLength(3)
      expect(rows.some((row) => row.start_km === 11_000 && row.end_km === 11_400)).toBe(false)
    })

    it('rolls three intervals and no more', () => {
      // 9.00, then (9.00 + 6.50) / 2 = 7.75, then 23.10 / 3 = 7.70.
      expect(rows.map((row) => row.rolling3_l_per_100km)).toEqual([9, 7.75, 7.7])
    })

    it('agrees with lib/fuel/consumption.ts, figure for figure', () => {
      const local = consumptionIntervals(
        FILLS.map((fill, index) => ({
          id: String(index).padStart(3, '0'),
          currency: 'VND',
          ...fill,
        })),
      )

      expect(local).toHaveLength(rows.length)
      for (const [index, interval] of local.entries()) {
        const row = rows[index]!
        expect(row.km).toBe(interval.km)
        expect(row.litres).toBe(interval.litres)
        expect(row.l_per_100km).toBe(interval.l_per_100km)
        expect(row.km_per_l).toBe(interval.km_per_l)
        expect(row.cost).toBe(interval.cost)
        expect(row.cost_per_km).toBe(interval.cost_per_km)
        expect(row.cost_per_litre).toBe(interval.cost_per_litre)
        expect(row.rolling3_l_per_100km).toBe(interval.rolling3_l_per_100km)
        expect(row.started_on).toBe(interval.started_on)
        expect(row.ended_on).toBe(interval.ended_on)
      }
    })
  })

  describe('v_fuel_summary', () => {
    it('counts every fill for spend and only closed intervals for consumption', async () => {
      const [summary] = (await rest(
        `v_fuel_summary?vehicle_id=eq.${vehicleId}&select=*`,
      )) as Record<string, string | number | null>[]

      // Six fills, 185.5 litres, 4,266,500 dong altogether.
      expect(summary?.fills).toBe(6)
      expect(summary?.total_litres).toBe(185.5)
      expect(summary?.total_cost).toBe(4_266_500)

      // Three usable intervals: 1,500km on 115.5 litres.
      //   115.5 x 100 / 1500 = 7.70,  1500 / 115.5 = 12.99
      //   (1,035,000 + 747,500 + 874,000) / 1500 = 2,656,500 / 1500 = 1,771
      expect(summary?.intervals).toBe(3)
      expect(summary?.measured_km).toBe(1500)
      expect(summary?.l_per_100km).toBe(7.7)
      expect(summary?.km_per_l).toBe(12.99)
      expect(summary?.cost_per_km).toBe(1771)
      expect(summary?.latest_l_per_100km).toBe(7.6)
      expect(summary?.rolling3_l_per_100km).toBe(7.7)
    })
  })

  // -------------------------------------------------------------------------
  // Parts and the negative sale expense
  // -------------------------------------------------------------------------

  describe('selling a part nets against the mod it was for', () => {
    let partId: string
    let purchaseId: string

    beforeAll(async () => {
      const purchases = (await rest('expenses', {
        method: 'POST',
        body: JSON.stringify([
          {
            user_id: user.id,
            occurred_on: '2026-03-01',
            amount: 12_000_000,
            currency: 'VND',
            vehicle_id: vehicleId,
            bucket: 'car_project',
            counts_toward_budget: false,
            mod_plan_id: modId,
            merchant: 'Intake, bought',
          },
        ]),
      })) as { id: string }[]
      purchaseId = purchases[0]!.id

      const parts = (await rest('parts', {
        method: 'POST',
        body: JSON.stringify([
          {
            user_id: user.id,
            vehicle_id: vehicleId,
            name: 'Stock airbox',
            status: 'on_car',
            expense_id: purchaseId,
            mod_plan_id: modId,
          },
        ]),
      })) as { id: string }[]
      partId = parts[0]!.id
    })

    it('starts with the mod costing what the part cost', async () => {
      const [mod] = (await rest(
        `v_mod_costs?mod_plan_id=eq.${modId}&select=actual`,
      )) as { actual: number }[]
      expect(mod?.actual).toBe(12_000_000)
    })

    it('takes the sale off the mod when the part is sold on', async () => {
      // What `removePartAction` writes: the same bucket, the same mod, and a
      // minus in front of the amount.
      const sales = (await rest('expenses', {
        method: 'POST',
        body: JSON.stringify([
          {
            user_id: user.id,
            occurred_on: '2026-04-01',
            amount: -3_000_000,
            currency: 'VND',
            vehicle_id: vehicleId,
            bucket: 'car_project',
            counts_toward_budget: false,
            mod_plan_id: modId,
            note: 'Sold: Stock airbox',
          },
        ]),
      })) as { id: string }[]

      await rest(`parts?id=eq.${partId}`, {
        method: 'PATCH',
        body: JSON.stringify({
          status: 'sold',
          removed_on: '2026-04-01',
          sale_expense_id: sales[0]!.id,
        }),
      })

      const [mod] = (await rest(
        `v_mod_costs?mod_plan_id=eq.${modId}&select=actual,expense_count`,
      )) as { actual: number; expense_count: number }[]

      // 12,000,000 spent, 3,000,000 back: the mod really cost nine million.
      expect(mod?.actual).toBe(9_000_000)
      expect(mod?.expense_count).toBe(2)
    })

    it('resolves the purchase and the sale separately, by foreign key name', async () => {
      // `parts` has two foreign keys into `expenses`, so a bare `expenses(...)`
      // embed is ambiguous and PostgREST refuses the whole select. Both
      // `lib/queries/parts.ts` and `removePartAction` name the key; this is the
      // check that they still resolve, because the failure mode is a screen that
      // renders and a removal that silently does nothing.
      const rows = (await rest(
        `parts?id=eq.${partId}&select=name,` +
          `purchase:expenses!parts_expense_id_fkey(amount),` +
          `sale:expenses!parts_sale_expense_id_fkey(amount)`,
      )) as { purchase: { amount: number } | null; sale: { amount: number } | null }[]

      expect(rows[0]?.purchase?.amount).toBe(12_000_000)
      expect(rows[0]?.sale?.amount).toBe(-3_000_000)
    })

    it('leaves the car lifetime spend net of the sale as well', async () => {
      const [totals] = (await rest(
        `v_vehicle_totals?vehicle_id=eq.${vehicleId}&select=project_spend`,
      )) as { project_spend: number }[]
      expect(totals?.project_spend).toBe(9_000_000)
    })
  })

  // -------------------------------------------------------------------------
  // RLS
  // -------------------------------------------------------------------------

  describe('none of it belongs to anybody else', () => {
    it('shows a stranger no schedule, no consumption and no parts', async () => {
      for (const view of ['v_service_due', 'v_fuel_consumption', 'v_fuel_summary']) {
        const response = await call(stranger, `${view}?vehicle_id=eq.${vehicleId}&select=*`)
        expect(await response.json()).toEqual([])
      }

      for (const table of ['service_schedules', 'service_records', 'fuel_logs', 'parts']) {
        const response = await call(stranger, `${table}?vehicle_id=eq.${vehicleId}&select=id`)
        expect(await response.json()).toEqual([])
      }
    })

    it('seeds a stranger their own seven schedules and only those', async () => {
      const response = await call(stranger, `service_schedules?select=vehicle_id`)
      const rows = (await response.json()) as { vehicle_id: string }[]
      expect(rows).toHaveLength(7)
      expect(rows.every((row) => row.vehicle_id === strangerVehicleId)).toBe(true)
    })

    it('refuses a stranger a fill-up on another persons car', async () => {
      const response = await call(stranger, 'fuel_logs', {
        method: 'POST',
        body: JSON.stringify([
          {
            user_id: user.id,
            vehicle_id: vehicleId,
            filled_on: '2026-05-01',
            odometer_km: 12_000,
            litres: 40,
            total_cost: 900_000,
          },
        ]),
      })
      expect(response.ok).toBe(false)
    })
  })
})
