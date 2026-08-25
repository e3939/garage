/**
 * Integration checks for the Phase 3 read paths, against the local stack.
 *
 * The acceptance criterion for the phase is one sentence: "the same set of
 * expenses produces three different, correct, clearly-labelled totals, and cost
 * per km is right." Two of those three things are arithmetic in Postgres, and
 * this file is where they are proved — the labels are the UI's job.
 *
 * Also here: the odometer trigger, which only ever raises the vehicle's reading,
 * and the purchase odometer, which is where kilometres are measured from.
 *
 * Skipped unless GARAGE_DB_TESTS is set, so `npm test` stays hermetic.
 * Run with `npm run test:db`.
 */

import { execFileSync } from 'node:child_process'

import { beforeAll, describe, expect, it } from 'vitest'

const ENABLED = process.env.GARAGE_DB_TESTS === '1'

type Stack = { apiUrl: string; publishableKey: string; secretKey: string }
type User = { id: string; token: string }

function readStack(): Stack {
  const raw = execFileSync('npx', ['supabase', 'status', '-o', 'json'], {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'ignore'],
  })
  const status = JSON.parse(raw.slice(raw.indexOf('{'))) as Record<string, string>
  return {
    apiUrl: status.API_URL ?? 'http://127.0.0.1:54321',
    publishableKey: status.PUBLISHABLE_KEY ?? status.ANON_KEY ?? '',
    secretKey: status.SECRET_KEY ?? status.SERVICE_ROLE_KEY ?? '',
  }
}

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

// ---------------------------------------------------------------------------
// The fixture
//
// A fixed month, so the three figures are constants a human can check by hand
// rather than something the test recomputes the same way the view does.
// ---------------------------------------------------------------------------

const MONTH = '2026-03-01'
const NEXT_MONTH = '2026-04-01'
const SPENT_ON = '2026-03-05'

const GROCERIES = 150_000
const FUEL = 850_000
const MODS = 24_000_000
const TYRES = 12_000_000
const TYRE_MONTHS = 12

const PURCHASE_PRICE = 620_000_000
const ODOMETER_AT_PURCHASE = 34_500
const ODOMETER_NOW = 40_000

/** Every car-bucket expense, at full amount. */
const TOTAL_SPEND = FUEL + MODS + TYRES
const TOTAL_INVESTED = PURCHASE_PRICE + TOTAL_SPEND
const KM_DRIVEN = ODOMETER_NOW - ODOMETER_AT_PURCHASE

let totalsVehicleId: string
let odometerVehicleId: string
let modsExpenseId: string
let modPlanId: string

type Totals = {
  monthly_total: number
  all_in_total: number
  car_only_total: number
  monthly_count: number
  all_in_count: number
  car_only_count: number
}

async function monthTotals(month: string): Promise<Totals | null> {
  const rows = (await rest(
    `v_month_totals?month=eq.${month}&currency=eq.VND&select=monthly_total,all_in_total,car_only_total,monthly_count,all_in_count,car_only_count`,
  )) as Totals[]
  return rows[0] ?? null
}

async function vehicleMonthTotals(vehicleId: string, month: string): Promise<Totals | null> {
  const rows = (await rest(
    `v_vehicle_month_totals?vehicle_id=eq.${vehicleId}&month=eq.${month}&currency=eq.VND&select=monthly_total,all_in_total,car_only_total,monthly_count,all_in_count,car_only_count`,
  )) as Totals[]
  return rows[0] ?? null
}

type VehicleTotalsRow = {
  total_spend: number
  running_spend: number
  project_spend: number
  purchase_price: number
  total_invested: number
  km_driven: number
  cost_per_km: number | null
  months_owned: number | null
  planning_accuracy: string | number | null
}

async function vehicleTotals(vehicleId: string): Promise<VehicleTotalsRow> {
  const rows = (await rest(
    `v_vehicle_totals?vehicle_id=eq.${vehicleId}&select=total_spend,running_spend,project_spend,purchase_price,total_invested,km_driven,cost_per_km,months_owned,planning_accuracy`,
  )) as VehicleTotalsRow[]
  const row = rows[0]
  if (!row) throw new Error('v_vehicle_totals returned nothing for that vehicle')
  return row
}

async function readVehicle(id: string): Promise<Record<string, number | string | null>> {
  const rows = (await rest(
    `vehicles?id=eq.${id}&select=odometer_km,odometer_at,purchase_odometer_km`,
  )) as Record<string, number | string | null>[]
  const row = rows[0]
  if (!row) throw new Error('vehicle vanished')
  return row
}

describe.skipIf(!ENABLED)('Phase 3 read paths', () => {
  beforeAll(async () => {
    stack = readStack()
    user = await createUser('vehicles')
    stranger = await createUser('stranger')

    // PostgREST insists every object in a bulk insert carries the same keys, so
    // two differently-shaped vehicles are two requests.
    const totalsVehicle = (await rest('vehicles', {
      method: 'POST',
      body: JSON.stringify({
        user_id: user.id,
        nickname: 'Totals probe',
        make: 'Honda',
        model: 'Civic',
        year: 2019,
        purchase_date: '2024-01-15',
        purchase_price: PURCHASE_PRICE,
        currency: 'VND',
        odometer_km: ODOMETER_NOW,
        purchase_odometer_km: ODOMETER_AT_PURCHASE,
      }),
    })) as { id: string }[]
    totalsVehicleId = totalsVehicle[0]!.id

    const odometerVehicle = (await rest('vehicles', {
      method: 'POST',
      body: JSON.stringify({
        user_id: user.id,
        nickname: 'Odometer probe',
        odometer_km: 10_000,
      }),
    })) as { id: string }[]
    odometerVehicleId = odometerVehicle[0]!.id

    const categories = (await rest('categories?select=id,name')) as { id: string; name: string }[]
    const byName = new Map(categories.map((entry) => [entry.name, entry.id]))

    const expense = (row: Record<string, unknown>) => ({
      user_id: user.id,
      occurred_on: SPENT_ON,
      currency: 'VND',
      vehicle_id: null,
      merchant: null,
      amortize_months: 1,
      ...row,
    })

    const inserted = (await rest('expenses', {
      method: 'POST',
      body: JSON.stringify([
        expense({
          amount: GROCERIES,
          category_id: byName.get('Groceries'),
          bucket: 'life',
          counts_toward_budget: true,
        }),
        expense({
          amount: FUEL,
          category_id: byName.get('Fuel'),
          vehicle_id: totalsVehicleId,
          bucket: 'car_running',
          counts_toward_budget: true,
        }),
        expense({
          amount: MODS,
          category_id: byName.get('Mods & Parts'),
          vehicle_id: totalsVehicleId,
          bucket: 'car_project',
          counts_toward_budget: false,
          merchant: 'Coilovers',
        }),
        expense({
          amount: TYRES,
          category_id: byName.get('Maintenance'),
          vehicle_id: totalsVehicleId,
          bucket: 'car_running',
          counts_toward_budget: true,
          amortize_months: TYRE_MONTHS,
        }),
      ]),
    })) as { id: string; merchant: string | null }[]

    modsExpenseId = inserted.find((entry) => entry.merchant === 'Coilovers')!.id
  })

  // -------------------------------------------------------------------------
  // The acceptance criterion
  // -------------------------------------------------------------------------

  describe('the same expenses, three views', () => {
    it('gives three different figures for the same month', async () => {
      const totals = await monthTotals(MONTH)

      // Monthly: only what counts toward the budget, and the tyres spread over
      // twelve months contribute a twelfth.
      expect(totals?.monthly_total).toBe(GROCERIES + FUEL + TYRES / TYRE_MONTHS)
      expect(totals?.monthly_total).toBe(2_000_000)

      // All-in: everything, at full amount, on the day it was paid.
      expect(totals?.all_in_total).toBe(GROCERIES + FUEL + MODS + TYRES)
      expect(totals?.all_in_total).toBe(37_000_000)

      // Car only: every car bucket, ignoring the budget switch, at full amount.
      expect(totals?.car_only_total).toBe(FUEL + MODS + TYRES)
      expect(totals?.car_only_total).toBe(36_850_000)

      const figures = [totals?.monthly_total, totals?.all_in_total, totals?.car_only_total]
      expect(new Set(figures).size).toBe(3)
    })

    it('counts the expenses behind each figure', async () => {
      const totals = await monthTotals(MONTH)
      // Three count toward the budget; four were paid; three were on the car.
      expect(totals?.monthly_count).toBe(3)
      expect(totals?.all_in_count).toBe(4)
      expect(totals?.car_only_count).toBe(3)
    })

    it('amortises the budget view and nothing else', async () => {
      const next = await monthTotals(NEXT_MONTH)
      expect(next?.monthly_total).toBe(TYRES / TYRE_MONTHS)
      expect(next?.all_in_total).toBe(0)
      expect(next?.car_only_total).toBe(0)
    })

    it('gives a vehicle the same three views, two of which agree by construction', async () => {
      const totals = await vehicleMonthTotals(totalsVehicleId, MONTH)
      expect(totals?.monthly_total).toBe(FUEL + TYRES / TYRE_MONTHS)
      expect(totals?.all_in_total).toBe(FUEL + MODS + TYRES)
      // A vehicle cannot carry a life expense, so these two are always equal.
      expect(totals?.car_only_total).toBe(totals?.all_in_total)
    })
  })

  // -------------------------------------------------------------------------
  // v_vehicle_totals
  // -------------------------------------------------------------------------

  describe('v_vehicle_totals', () => {
    it('sums lifetime spend undiscounted and splits it by bucket', async () => {
      const totals = await vehicleTotals(totalsVehicleId)
      expect(totals.total_spend).toBe(TOTAL_SPEND)
      expect(totals.running_spend).toBe(FUEL + TYRES)
      expect(totals.project_spend).toBe(MODS)
      expect(totals.running_spend + totals.project_spend).toBe(totals.total_spend)
    })

    it('folds the purchase price into total invested', async () => {
      const totals = await vehicleTotals(totalsVehicleId)
      expect(totals.purchase_price).toBe(PURCHASE_PRICE)
      expect(totals.total_invested).toBe(TOTAL_INVESTED)
    })

    it('measures km driven from the reading at purchase', async () => {
      const totals = await vehicleTotals(totalsVehicleId)
      expect(totals.km_driven).toBe(KM_DRIVEN)
      expect(totals.km_driven).toBe(5_500)
    })

    it('gets cost per km right', async () => {
      const totals = await vehicleTotals(totalsVehicleId)
      // 656.850.000 over 5.500 km, rounded to the nearest dong.
      expect(totals.cost_per_km).toBe(Math.round(TOTAL_INVESTED / KM_DRIVEN))
      expect(totals.cost_per_km).toBe(119_427)
    })

    it('reports no cost per km for a car that has not moved', async () => {
      const totals = await vehicleTotals(odometerVehicleId)
      expect(totals.km_driven).toBe(0)
      expect(totals.cost_per_km).toBeNull()
    })

    it('counts whole months of ownership, and none when the date is unknown', async () => {
      const owned = await vehicleTotals(totalsVehicleId)
      expect(typeof owned.months_owned).toBe('number')
      expect(owned.months_owned).toBeGreaterThan(0)

      const undated = await vehicleTotals(odometerVehicleId)
      expect(undated.months_owned).toBeNull()
    })

    it('has no planning accuracy until a mod is installed', async () => {
      const totals = await vehicleTotals(totalsVehicleId)
      expect(totals.planning_accuracy).toBeNull()
    })

    it('takes planning accuracy as actuals over the midpoint of the estimate', async () => {
      const plans = (await rest('mod_plans', {
        method: 'POST',
        body: JSON.stringify({
          user_id: user.id,
          vehicle_id: totalsVehicleId,
          title: 'Coilovers',
          status: 'installed',
          est_cost_min: 20_000_000,
          est_cost_max: 28_000_000,
        }),
      })) as { id: string }[]
      modPlanId = plans[0]!.id

      await rest(`expenses?id=eq.${modsExpenseId}`, {
        method: 'PATCH',
        body: JSON.stringify({ mod_plan_id: modPlanId }),
      })

      const totals = await vehicleTotals(totalsVehicleId)
      // Midpoint of 20m and 28m is 24m, and 24m is what it cost.
      expect(Number(totals.planning_accuracy)).toBe(1)

      // Put the fixture back, so this test does not depend on running last.
      await rest(`expenses?id=eq.${modsExpenseId}`, {
        method: 'PATCH',
        body: JSON.stringify({ mod_plan_id: null }),
      })
      await rest(`mod_plans?id=eq.${modPlanId}`, { method: 'DELETE' })
    })
  })

  // -------------------------------------------------------------------------
  // The odometer
  // -------------------------------------------------------------------------

  describe('the odometer', () => {
    it('starts kilometres at whatever the clock said when the car was entered', async () => {
      const rows = (await rest('vehicles', {
        method: 'POST',
        body: JSON.stringify({
          user_id: user.id,
          nickname: 'Mid-life probe',
          odometer_km: 88_000,
        }),
      })) as { id: string }[]

      const vehicle = await readVehicle(rows[0]!.id)
      expect(vehicle.purchase_odometer_km).toBe(88_000)
      expect(vehicle.odometer_km).toBe(88_000)

      await rest(`vehicles?id=eq.${rows[0]!.id}`, { method: 'DELETE' })
    })

    it('refuses a reading at purchase above the current one', async () => {
      const response = await call(user, 'vehicles', {
        method: 'POST',
        body: JSON.stringify({
          user_id: user.id,
          nickname: 'Impossible probe',
          odometer_km: 10_000,
          purchase_odometer_km: 50_000,
        }),
      })
      expect(response.ok).toBe(false)
      expect(await response.text()).toContain('vehicles_purchase_odometer_check')
    })

    it('raises the vehicle to a higher reading, and stamps the date', async () => {
      await rest('expenses', {
        method: 'POST',
        body: JSON.stringify({
          user_id: user.id,
          occurred_on: '2026-03-20',
          amount: 500_000,
          currency: 'VND',
          vehicle_id: odometerVehicleId,
          bucket: 'car_running',
          counts_toward_budget: true,
          odometer_km: 11_200,
        }),
      })

      const vehicle = await readVehicle(odometerVehicleId)
      expect(vehicle.odometer_km).toBe(11_200)
      expect(vehicle.odometer_at).toBe('2026-03-20')
    })

    it('saves a lower reading without lowering the vehicle', async () => {
      const inserted = (await rest('expenses', {
        method: 'POST',
        body: JSON.stringify({
          user_id: user.id,
          occurred_on: '2026-03-21',
          amount: 300_000,
          currency: 'VND',
          vehicle_id: odometerVehicleId,
          bucket: 'car_running',
          counts_toward_budget: true,
          odometer_km: 9_000,
        }),
      })) as { odometer_km: number }[]

      // The reading is kept exactly as it was typed...
      expect(inserted[0]?.odometer_km).toBe(9_000)

      // ...and the vehicle does not move backwards.
      const vehicle = await readVehicle(odometerVehicleId)
      expect(vehicle.odometer_km).toBe(11_200)
      expect(vehicle.odometer_at).toBe('2026-03-20')
    })

    it('leaves the reading at purchase alone however far the car goes', async () => {
      const vehicle = await readVehicle(odometerVehicleId)
      expect(vehicle.purchase_odometer_km).toBe(10_000)
    })
  })

  // -------------------------------------------------------------------------
  // RLS
  // -------------------------------------------------------------------------

  describe('the new views under RLS', () => {
    it('shows a second user none of the first user’s figures', async () => {
      for (const view of ['v_vehicle_totals', 'v_month_totals', 'v_vehicle_month_totals']) {
        const response = await call(stranger, `${view}?select=*`)
        expect(response.ok).toBe(true)
        expect(await response.json()).toEqual([])
      }
    })
  })
})
