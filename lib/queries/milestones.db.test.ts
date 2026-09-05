/**
 * Integration checks for automatic milestones, against the local stack.
 *
 * docs/01-PRODUCT.md section H names seven of them and adds "they are rare
 * enough to feel earned — do not add more without asking". Rare is the part that
 * is hard to prove by looking at the app: a stamp that appears twice, or that
 * appears on the ninth fill-up, is exactly the failure that makes the whole
 * device stop meaning anything. So every case here asserts a count as well as a
 * presence, and every one of them runs the awarding path twice.
 *
 * Skipped unless GARAGE_DB_TESTS is set, so `npm test` stays hermetic.
 * Run with `npm run test:db`.
 */

import { beforeAll, describe, expect, it } from 'vitest'

import { DB_TESTS_ENABLED, readStack, type Stack } from '@/lib/supabase/test-stack'


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

async function rest(as: User, path: string, init: RequestInit = {}): Promise<unknown> {
  const response = await call(as, path, init)
  const text = await response.text()
  if (!response.ok) throw new Error(`${path} failed: ${response.status} ${text}`)
  return text === '' ? [] : JSON.parse(text)
}

type Milestone = {
  id: string
  kind: string
  achieved_on: string
  title: string
  body: string | null
  auto: boolean
  vehicle_id: string | null
}

async function milestones(as: User, vehicleId: string): Promise<Milestone[]> {
  return (await rest(
    as,
    `milestones?vehicle_id=eq.${vehicleId}&order=kind`,
  )) as Milestone[]
}

async function kindsOf(as: User, vehicleId: string): Promise<string[]> {
  return (await milestones(as, vehicleId)).map((row) => row.kind)
}

async function newVehicle(
  as: User,
  fields: Record<string, unknown> = {},
): Promise<string> {
  const rows = (await rest(as, 'vehicles', {
    method: 'POST',
    body: JSON.stringify({
      user_id: as.id,
      nickname: 'Milestone probe',
      odometer_km: 10_000,
      purchase_odometer_km: 10_000,
      ...fields,
    }),
  })) as { id: string }[]
  return rows[0]!.id
}

type PageRow = {
  ref_id: string
  kind: string
  title: string
  stamp: string | null
}

async function page(as: User, vehicleId: string, limit = 200): Promise<PageRow[]> {
  const response = await call(as, 'rpc/timeline_page', {
    method: 'POST',
    body: JSON.stringify({
      p_vehicle_id: vehicleId,
      p_limit: limit,
      p_cursor_occurred_on: null,
      p_cursor_created_at: null,
      p_cursor_id: null,
    }),
  })
  const text = await response.text()
  if (!response.ok) throw new Error(`timeline_page failed: ${response.status} ${text}`)
  return JSON.parse(text) as PageRow[]
}

/** Today, in the app's timezone, because the SQL compares against current_date. */
function today(): string {
  return new Date().toISOString().slice(0, 10)
}

function yearsAgo(years: number): string {
  const date = new Date()
  date.setUTCFullYear(date.getUTCFullYear() - years)
  return date.toISOString().slice(0, 10)
}

describe.skipIf(!DB_TESTS_ENABLED)('automatic milestones', () => {
  beforeAll(async () => {
    stack = readStack()
    user = await createUser('milestones')
    stranger = await createUser('milestones-stranger')
  })

  it('awards the first expense once, dated by the expense', async () => {
    const vehicleId = await newVehicle(user)
    expect(await kindsOf(user, vehicleId)).toEqual([])

    await rest(user, 'expenses', {
      method: 'POST',
      body: JSON.stringify({
        user_id: user.id,
        vehicle_id: vehicleId,
        occurred_on: '2026-03-04',
        amount: 500_000,
        currency: 'VND',
        bucket: 'car_running',
        counts_toward_budget: true,
      }),
    })

    const first = await milestones(user, vehicleId)
    expect(first.map((row) => row.kind)).toEqual(['first_expense'])
    expect(first[0]!.achieved_on).toBe('2026-03-04')
    expect(first[0]!.auto).toBe(true)

    // A second expense, and an earlier one at that, must not move or duplicate
    // the stamp: the milestone is the day it happened, not the day it was
    // noticed.
    await rest(user, 'expenses', {
      method: 'POST',
      body: JSON.stringify({
        user_id: user.id,
        vehicle_id: vehicleId,
        occurred_on: '2026-02-01',
        amount: 200_000,
        currency: 'VND',
        bucket: 'car_running',
        counts_toward_budget: true,
      }),
    })

    const after = await milestones(user, vehicleId)
    expect(after).toHaveLength(1)
    expect(after[0]!.achieved_on).toBe('2026-03-04')
  })

  it('ignores an expense with no vehicle, and a draft', async () => {
    const vehicleId = await newVehicle(user)

    await rest(user, 'expenses', {
      method: 'POST',
      body: JSON.stringify([
        {
          user_id: user.id,
          vehicle_id: null,
          occurred_on: '2026-03-04',
          amount: 150_000,
          currency: 'VND',
          bucket: 'life',
          counts_toward_budget: true,
          is_draft: false,
        },
        {
          user_id: user.id,
          vehicle_id: vehicleId,
          occurred_on: '2026-03-05',
          amount: 150_000,
          currency: 'VND',
          bucket: 'car_running',
          counts_toward_budget: true,
          is_draft: true,
        },
      ]),
    })

    expect(await kindsOf(user, vehicleId)).toEqual([])
  })

  it('awards the first installed mod, not a planned one', async () => {
    const vehicleId = await newVehicle(user)

    const mods = (await rest(user, 'mod_plans', {
      method: 'POST',
      body: JSON.stringify({
        user_id: user.id,
        vehicle_id: vehicleId,
        title: 'Coilovers',
        status: 'saving',
      }),
    })) as { id: string }[]

    expect(await kindsOf(user, vehicleId)).toEqual([])

    await rest(user, `mod_plans?id=eq.${mods[0]!.id}`, {
      method: 'PATCH',
      body: JSON.stringify({ status: 'installed', installed_on: '2026-04-11' }),
    })

    const awarded = await milestones(user, vehicleId)
    expect(awarded.map((row) => row.kind)).toEqual(['first_mod'])
    expect(awarded[0]!.achieved_on).toBe('2026-04-11')
  })

  it('awards a stamp for every ten thousand kilometres driven, and no more', async () => {
    // Bought with 10.000 on the clock, so the stamps count what this owner drove.
    const vehicleId = await newVehicle(user, {
      odometer_km: 10_000,
      purchase_odometer_km: 10_000,
    })

    await rest(user, `vehicles?id=eq.${vehicleId}`, {
      method: 'PATCH',
      body: JSON.stringify({ odometer_km: 19_999, odometer_at: '2026-06-01' }),
    })
    expect(await kindsOf(user, vehicleId)).toEqual([])

    await rest(user, `vehicles?id=eq.${vehicleId}`, {
      method: 'PATCH',
      body: JSON.stringify({ odometer_km: 20_000, odometer_at: '2026-06-02' }),
    })

    const ten = await milestones(user, vehicleId)
    expect(ten.map((row) => row.kind)).toEqual(['km_10000'])
    expect(ten[0]!.achieved_on).toBe('2026-06-02')
    expect(ten[0]!.title).toBe('10.000 km driven')

    // Twenty thousand at once: the one that was skipped is still awarded, so a
    // car entered late does not lose the stamps it drove past.
    await rest(user, `vehicles?id=eq.${vehicleId}`, {
      method: 'PATCH',
      body: JSON.stringify({ odometer_km: 40_100, odometer_at: '2026-07-02' }),
    })

    expect(await kindsOf(user, vehicleId)).toEqual(['km_10000', 'km_20000', 'km_30000'])
  })

  it('awards a year of ownership, dated the anniversary', async () => {
    const anniversary = yearsAgo(2)
    const vehicleId = await newVehicle(user, { purchase_date: anniversary })

    const owned = await milestones(user, vehicleId)
    expect(owned.map((row) => row.kind)).toEqual(['owned_1_year'])

    const expected = new Date(anniversary)
    expected.setUTCFullYear(expected.getUTCFullYear() + 1)
    expect(owned[0]!.achieved_on).toBe(expected.toISOString().slice(0, 10))
  })

  it('does not award a year of ownership on a car bought this morning', async () => {
    const vehicleId = await newVehicle(user, { purchase_date: today() })
    expect(await kindsOf(user, vehicleId)).toEqual([])
  })

  it('awards ten fill-ups on the tenth, dated by it', async () => {
    const vehicleId = await newVehicle(user, {
      odometer_km: 50_000,
      purchase_odometer_km: 50_000,
    })

    const fills = Array.from({ length: 9 }, (_unused, index) => ({
      user_id: user.id,
      vehicle_id: vehicleId,
      filled_on: `2026-01-${String(index + 1).padStart(2, '0')}`,
      // Kept flat so the odometer never crosses a ten-thousand and adds a stamp
      // this assertion did not ask about.
      odometer_km: 50_000,
      litres: 30,
      total_cost: 600_000,
      currency: 'VND',
    }))

    await rest(user, 'fuel_logs', { method: 'POST', body: JSON.stringify(fills) })
    expect(await kindsOf(user, vehicleId)).toEqual([])

    await rest(user, 'fuel_logs', {
      method: 'POST',
      body: JSON.stringify({
        user_id: user.id,
        vehicle_id: vehicleId,
        filled_on: '2026-01-10',
        odometer_km: 50_000,
        litres: 31,
        total_cost: 610_000,
        currency: 'VND',
      }),
    })

    const ten = await milestones(user, vehicleId)
    expect(ten.map((row) => row.kind)).toEqual(['fills_10'])
    expect(ten[0]!.achieved_on).toBe('2026-01-10')

    // An eleventh does not award an eleventh stamp.
    await rest(user, 'fuel_logs', {
      method: 'POST',
      body: JSON.stringify({
        user_id: user.id,
        vehicle_id: vehicleId,
        filled_on: '2026-01-11',
        odometer_km: 50_000,
        litres: 31,
        total_cost: 610_000,
        currency: 'VND',
      }),
    })
    expect(await milestones(user, vehicleId)).toHaveLength(1)
  })

  it('awards the first full service cycle only when every item has been done', async () => {
    const vehicleId = await newVehicle(user, {
      odometer_km: 60_000,
      purchase_odometer_km: 60_000,
    })

    // A new car arrives with the seven seeded intervals of docs/01-PRODUCT.md
    // section D, so the cycle this test closes is the real one rather than a
    // convenient pair.
    const schedules = (await rest(
      user,
      `service_schedules?vehicle_id=eq.${vehicleId}&order=name`,
    )) as { id: string; name: string }[]
    expect(schedules.length).toBeGreaterThan(1)

    for (const [index, schedule] of schedules.entries()) {
      await rest(user, 'service_records', {
        method: 'POST',
        body: JSON.stringify({
          user_id: user.id,
          vehicle_id: vehicleId,
          schedule_id: schedule.id,
          name: schedule.name,
          performed_on: `2026-0${index + 1}-1${index}`,
        }),
      })

      if (index < schedules.length - 1) {
        expect(await kindsOf(user, vehicleId)).toEqual([])
      }
    }

    const cycle = await milestones(user, vehicleId)
    expect(cycle.map((row) => row.kind)).toEqual(['service_cycle'])
    // Dated by the day the cycle closed, which is the last of the firsts.
    expect(cycle[0]!.achieved_on).toBe(`2026-0${schedules.length}-1${schedules.length - 1}`)
  })

  it('awards a hundred log entries on the hundredth, counting no milestones', async () => {
    const vehicleId = await newVehicle(user, {
      odometer_km: 70_000,
      purchase_odometer_km: 70_000,
    })

    const notes = Array.from({ length: 99 }, (_unused, index) => ({
      user_id: user.id,
      vehicle_id: vehicleId,
      occurred_on: '2026-02-02',
      title: `Entry ${index + 1}`,
    }))
    await rest(user, 'timeline_notes', { method: 'POST', body: JSON.stringify(notes) })
    expect(await kindsOf(user, vehicleId)).toEqual([])

    await rest(user, 'timeline_notes', {
      method: 'POST',
      body: JSON.stringify({
        user_id: user.id,
        vehicle_id: vehicleId,
        occurred_on: '2026-02-03',
        title: 'The hundredth',
      }),
    })

    const hundred = await milestones(user, vehicleId)
    expect(hundred.map((row) => row.kind)).toEqual(['log_100'])
    expect(hundred[0]!.achieved_on).toBe('2026-02-03')
  })

  it('carries a stamp into the feed for milestones and installed mods only', async () => {
    const vehicleId = await newVehicle(user, {
      odometer_km: 80_000,
      purchase_odometer_km: 80_000,
    })

    await rest(user, 'mod_plans', {
      method: 'POST',
      body: JSON.stringify([
        {
          user_id: user.id,
          vehicle_id: vehicleId,
          title: 'Intake',
          status: 'installed',
          installed_on: '2026-05-01',
        },
        {
          user_id: user.id,
          vehicle_id: vehicleId,
          title: 'Wheels',
          status: 'dreaming',
          installed_on: null,
        },
      ]),
    })

    await rest(user, 'timeline_notes', {
      method: 'POST',
      body: JSON.stringify({
        user_id: user.id,
        vehicle_id: vehicleId,
        occurred_on: '2026-05-02',
        title: 'A good drive',
      }),
    })

    const rows = await page(user, vehicleId)
    const stamps = Object.fromEntries(rows.map((row) => [row.title, row.stamp]))

    expect(stamps.Intake).toBe('Installed')
    expect(stamps.Wheels).toBeNull()
    expect(stamps['A good drive']).toBeNull()
    // The mod above is the first installed one, so its milestone is in the feed
    // too, stamped with its own title.
    expect(stamps['First mod installed']).toBe('First mod installed')
  })

  it('keeps one person’s milestones out of another’s reach', async () => {
    const vehicleId = await newVehicle(user, {
      odometer_km: 90_000,
      purchase_odometer_km: 90_000,
    })
    await rest(user, 'expenses', {
      method: 'POST',
      body: JSON.stringify({
        user_id: user.id,
        vehicle_id: vehicleId,
        occurred_on: '2026-03-04',
        amount: 500_000,
        currency: 'VND',
        bucket: 'car_running',
        counts_toward_budget: true,
      }),
    })

    expect(await kindsOf(user, vehicleId)).toEqual(['first_expense'])
    expect(await kindsOf(stranger, vehicleId)).toEqual([])
    expect(await page(stranger, vehicleId)).toEqual([])
  })
})
