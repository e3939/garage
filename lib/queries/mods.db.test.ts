/**
 * Integration checks for the mod planner, against the local stack.
 *
 * The phase's acceptance criterion — "planning a mod makes you want to fund it"
 * — is a judgement a person makes. What can be proved here is everything that
 * judgement rests on: that the estimate midpoint is the number the board and the
 * vehicle page both use, that the actual is the sum of every expense pointing at
 * the mod, that the build sheet adds up per column and once for the whole plan,
 * that a drag lands as one statement and stamps the install date, and that none
 * of it is visible to anybody else.
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

async function rest(path: string, init: RequestInit = {}): Promise<unknown> {
  const response = await call(user, path, init)
  const text = await response.text()
  if (!response.ok) throw new Error(`${path} failed: ${response.status} ${text}`)
  return text === '' ? [] : JSON.parse(text)
}

type BoardRow = {
  id: string
  title: string
  status: string
  priority: string
  est_cost_min: number | null
  est_cost_max: number | null
  estimate: number | null
  actual: number
  variance: number | null
  expense_count: number
  currency: string
  installed_on: string | null
  board_order: number
  depends_on: { id: string; title: string; status: string }[]
  photos: { id: string; storage_path: string; caption: string | null }[]
}

async function board(as: User, vehicle: string): Promise<BoardRow[]> {
  const response = await call(as, 'rpc/mod_board', {
    method: 'POST',
    body: JSON.stringify({ p_vehicle_id: vehicle }),
  })
  const text = await response.text()
  if (!response.ok) throw new Error(`mod_board failed: ${response.status} ${text}`)
  return JSON.parse(text) as BoardRow[]
}

async function reorder(
  as: User,
  vehicle: string,
  moves: { id: string; status: string; board_order: number }[],
  today = '2026-08-26',
): Promise<Response> {
  return call(as, 'rpc/mod_reorder', {
    method: 'POST',
    body: JSON.stringify({ p_vehicle_id: vehicle, p_moves: moves, p_today: today }),
  })
}

type TotalsRow = {
  status: string | null
  mods: number
  estimate_total: number
  estimate_min_total: number
  estimate_max_total: number
  actual_total: number
  without_estimate: number
}

async function totals(vehicle: string): Promise<Map<string, TotalsRow>> {
  const rows = (await rest(
    `v_mod_board_totals?vehicle_id=eq.${vehicle}&currency=eq.VND&select=status,mods,estimate_total,estimate_min_total,estimate_max_total,actual_total,without_estimate`,
  )) as TotalsRow[]
  return new Map(rows.map((row) => [row.status ?? 'whole', row]))
}

// ---------------------------------------------------------------------------
// The fixture: one car and a plan somebody would actually recognise.
//
//   Coilovers  20m to 24m, saving       -> estimate 22m
//   Wheels     up to 30m, dreaming      -> estimate 30m, needs the coilovers
//   Intake     from 5m, installed       -> estimate 5m, two expenses totalling 5.5m
//   Wrap       no estimate, dreaming    -> in the plan, out of the total
// ---------------------------------------------------------------------------

let vehicleId: string
let otherVehicleId: string
let coilovers: string
let wheels: string
let intake: string
let wrap: string

describe.skipIf(!DB_TESTS_ENABLED)('Phase 5 mod planner', () => {
  beforeAll(async () => {
    stack = readStack()
    user = await createUser('mods')
    stranger = await createUser('mods-stranger')

    const vehicles = (await rest('vehicles', {
      method: 'POST',
      body: JSON.stringify([
        { user_id: user.id, nickname: 'Board probe', odometer_km: 40_000, sort_order: 0 },
        { user_id: user.id, nickname: 'Other car', odometer_km: 1_000, sort_order: 1 },
      ]),
    })) as { id: string }[]
    vehicleId = vehicles[0]!.id
    otherVehicleId = vehicles[1]!.id

    const mods = (await rest('mod_plans', {
      method: 'POST',
      body: JSON.stringify([
        // PostgREST insists every object in a bulk insert carries the same
        // keys, so the absent ones are spelled out as nulls.
        {
          user_id: user.id,
          vehicle_id: vehicleId,
          title: 'Coilovers',
          status: 'saving',
          priority: 'needed',
          est_cost_min: 20_000_000,
          est_cost_max: 24_000_000,
          installed_on: null,
          board_order: 0,
        },
        {
          user_id: user.id,
          vehicle_id: vehicleId,
          title: 'Wheels',
          status: 'dreaming',
          priority: 'next_up',
          est_cost_min: null,
          est_cost_max: 30_000_000,
          installed_on: null,
          board_order: 0,
        },
        {
          user_id: user.id,
          vehicle_id: vehicleId,
          title: 'Intake',
          status: 'installed',
          priority: 'someday',
          est_cost_min: 5_000_000,
          est_cost_max: null,
          installed_on: '2026-07-04',
          board_order: 0,
        },
        {
          user_id: user.id,
          vehicle_id: vehicleId,
          title: 'Wrap',
          status: 'dreaming',
          priority: 'dreaming',
          est_cost_min: null,
          est_cost_max: null,
          installed_on: null,
          board_order: 1,
        },
      ]),
    })) as { id: string; title: string }[]

    const byTitle = new Map(mods.map((mod) => [mod.title, mod.id]))
    coilovers = byTitle.get('Coilovers')!
    wheels = byTitle.get('Wheels')!
    intake = byTitle.get('Intake')!
    wrap = byTitle.get('Wrap')!

    await rest('mod_dependencies', {
      method: 'POST',
      body: JSON.stringify([{ mod_plan_id: wheels, depends_on_id: coilovers }]),
    })

    await rest('expenses', {
      method: 'POST',
      body: JSON.stringify([
        {
          user_id: user.id,
          vehicle_id: vehicleId,
          occurred_on: '2026-07-04',
          amount: 3_000_000,
          currency: 'VND',
          bucket: 'car_project',
          counts_toward_budget: false,
          merchant: 'The part',
          mod_plan_id: intake,
          is_draft: false,
        },
        {
          user_id: user.id,
          vehicle_id: vehicleId,
          occurred_on: '2026-07-06',
          amount: 2_500_000,
          currency: 'VND',
          bucket: 'car_project',
          counts_toward_budget: false,
          merchant: 'The bracket you forgot',
          mod_plan_id: intake,
          is_draft: false,
        },
        {
          // A draft is awaiting confirmation and is not spend yet.
          user_id: user.id,
          vehicle_id: vehicleId,
          occurred_on: '2026-07-08',
          amount: 900_000,
          currency: 'VND',
          bucket: 'car_project',
          counts_toward_budget: false,
          merchant: 'Not confirmed',
          mod_plan_id: intake,
          is_draft: true,
        },
      ]),
    })

    await rest('attachments', {
      method: 'POST',
      body: JSON.stringify([
        {
          user_id: user.id,
          storage_path: `${user.id}/${vehicleId}/${crypto.randomUUID()}.webp`,
          bucket_name: 'inspiration',
          kind: 'inspiration',
          caption: 'The look',
          mod_plan_id: wheels,
          sort_order: 0,
        },
      ]),
    })
  })

  // -------------------------------------------------------------------------
  // The estimate, the actual and the difference
  // -------------------------------------------------------------------------

  it('takes the estimate as the midpoint of the range', async () => {
    const rows = await board(user, vehicleId)
    expect(rows.find((row) => row.id === coilovers)?.estimate).toBe(22_000_000)
  })

  it('takes whichever end exists when only one does', async () => {
    const rows = await board(user, vehicleId)
    expect(rows.find((row) => row.id === wheels)?.estimate).toBe(30_000_000)
    expect(rows.find((row) => row.id === intake)?.estimate).toBe(5_000_000)
  })

  it('leaves a mod with no estimate null rather than zero', async () => {
    const rows = await board(user, vehicleId)
    const row = rows.find((entry) => entry.id === wrap)
    expect(row?.estimate).toBeNull()
    expect(row?.variance).toBeNull()
  })

  it('sums every confirmed expense pointing at the mod, and no draft', async () => {
    const rows = await board(user, vehicleId)
    const row = rows.find((entry) => entry.id === intake)
    expect(row?.actual).toBe(5_500_000)
    expect(row?.expense_count).toBe(2)
  })

  it('reports the variance with a sign', async () => {
    const rows = await board(user, vehicleId)
    expect(rows.find((row) => row.id === intake)?.variance).toBe(500_000)
  })

  it('reports no actual for a mod nothing has been spent on', async () => {
    const rows = await board(user, vehicleId)
    const row = rows.find((entry) => entry.id === coilovers)
    expect(row?.actual).toBe(0)
    expect(row?.expense_count).toBe(0)
  })

  // -------------------------------------------------------------------------
  // Dependencies and photos travel with the card
  // -------------------------------------------------------------------------

  it('carries each dependency with its current status, so a blocker can be named', async () => {
    const rows = await board(user, vehicleId)
    expect(rows.find((row) => row.id === wheels)?.depends_on).toEqual([
      { id: coilovers, title: 'Coilovers', status: 'saving' },
    ])
  })

  it('carries no dependencies on a mod that has none', async () => {
    const rows = await board(user, vehicleId)
    expect(rows.find((row) => row.id === coilovers)?.depends_on).toEqual([])
  })

  it('carries the inspiration photos', async () => {
    const rows = await board(user, vehicleId)
    const photos = rows.find((row) => row.id === wheels)?.photos ?? []
    expect(photos).toHaveLength(1)
    expect(photos[0]?.caption).toBe('The look')
  })

  // -------------------------------------------------------------------------
  // The build sheet
  // -------------------------------------------------------------------------

  it('adds a column up', async () => {
    const sheet = await totals(vehicleId)
    expect(sheet.get('dreaming')).toMatchObject({
      mods: 2,
      estimate_total: 30_000_000,
      without_estimate: 1,
    })
    expect(sheet.get('saving')).toMatchObject({ mods: 1, estimate_total: 22_000_000 })
    expect(sheet.get('installed')).toMatchObject({
      mods: 1,
      estimate_total: 5_000_000,
      actual_total: 5_500_000,
    })
  })

  it('adds the whole plan up in a row of its own', async () => {
    const sheet = await totals(vehicleId)
    expect(sheet.get('whole')).toMatchObject({
      mods: 4,
      estimate_total: 57_000_000,
      actual_total: 5_500_000,
      without_estimate: 1,
    })
  })

  it('keeps the low and high ends separately', async () => {
    const sheet = await totals(vehicleId)
    expect(sheet.get('whole')).toMatchObject({
      estimate_min_total: 25_000_000,
      estimate_max_total: 54_000_000,
    })
  })

  // -------------------------------------------------------------------------
  // Planning accuracy — the figure on the vehicle page
  // -------------------------------------------------------------------------

  it('measures planning accuracy as actual over estimate across installed mods', async () => {
    const rows = (await rest(
      `v_vehicle_totals?vehicle_id=eq.${vehicleId}&select=planning_accuracy`,
    )) as { planning_accuracy: number | null }[]
    // 5.5m spent against a 5m estimate.
    expect(Number(rows[0]?.planning_accuracy)).toBeCloseTo(1.1, 4)
  })

  // -------------------------------------------------------------------------
  // A drag
  // -------------------------------------------------------------------------

  it('applies a whole drag in one call', async () => {
    const response = await reorder(user, vehicleId, [
      { id: wrap, status: 'dreaming', board_order: 0 },
      { id: wheels, status: 'dreaming', board_order: 1 },
    ])
    expect(response.status).toBe(200)

    const rows = await board(user, vehicleId)
    expect(rows.find((row) => row.id === wrap)?.board_order).toBe(0)
    expect(rows.find((row) => row.id === wheels)?.board_order).toBe(1)
  })

  it('stamps installed_on when a card lands in Installed, and clears it on the way out', async () => {
    await reorder(user, vehicleId, [{ id: wrap, status: 'installed', board_order: 1 }])
    let rows = await board(user, vehicleId)
    expect(rows.find((row) => row.id === wrap)?.installed_on).toBe('2026-08-26')

    await reorder(user, vehicleId, [{ id: wrap, status: 'dreaming', board_order: 0 }])
    rows = await board(user, vehicleId)
    expect(rows.find((row) => row.id === wrap)?.installed_on).toBeNull()
  })

  it('leaves an install date that was already there alone', async () => {
    await reorder(user, vehicleId, [{ id: intake, status: 'installed', board_order: 0 }])
    const rows = await board(user, vehicleId)
    expect(rows.find((row) => row.id === intake)?.installed_on).toBe('2026-07-04')
  })

  it('will not move a mod that belongs to another vehicle', async () => {
    const response = await reorder(user, otherVehicleId, [
      { id: coilovers, status: 'ordered', board_order: 0 },
    ])
    expect(response.status).toBe(200)
    expect((await response.json()) as number).toBe(0)

    const rows = await board(user, vehicleId)
    expect(rows.find((row) => row.id === coilovers)?.status).toBe('saving')
  })

  // -------------------------------------------------------------------------
  // Archiving
  // -------------------------------------------------------------------------

  it('takes an archived mod off the board and out of the build sheet', async () => {
    await rest(`mod_plans?id=eq.${wrap}`, {
      method: 'PATCH',
      body: JSON.stringify({ archived_at: new Date().toISOString() }),
    })

    const rows = await board(user, vehicleId)
    expect(rows.map((row) => row.id)).not.toContain(wrap)
    expect((await totals(vehicleId)).get('whole')?.mods).toBe(3)

    await rest(`mod_plans?id=eq.${wrap}`, {
      method: 'PATCH',
      body: JSON.stringify({ archived_at: null }),
    })
  })

  // -------------------------------------------------------------------------
  // Nobody else's business
  // -------------------------------------------------------------------------

  it('shows a stranger nothing through mod_board', async () => {
    expect(await board(stranger, vehicleId)).toEqual([])
  })

  it('shows a stranger nothing through v_mod_costs', async () => {
    const response = await call(stranger, `v_mod_costs?vehicle_id=eq.${vehicleId}&select=mod_plan_id`)
    expect(await response.json()).toEqual([])
  })

  it('shows a stranger nothing through v_mod_board_totals', async () => {
    const response = await call(
      stranger,
      `v_mod_board_totals?vehicle_id=eq.${vehicleId}&select=mods`,
    )
    expect(await response.json()).toEqual([])
  })

  it('will not let a stranger reorder this board', async () => {
    const response = await reorder(stranger, vehicleId, [
      { id: coilovers, status: 'ordered', board_order: 0 },
    ])
    expect(response.status).toBe(200)
    expect((await response.json()) as number).toBe(0)

    const rows = await board(user, vehicleId)
    expect(rows.find((row) => row.id === coilovers)?.status).toBe('saving')
  })

  it('will not let a stranger point a dependency at this board', async () => {
    const theirs = (await (
      await call(stranger, 'mod_plans', {
        method: 'POST',
        body: JSON.stringify([
          {
            user_id: stranger.id,
            vehicle_id: (
              await (
                await call(stranger, 'vehicles', {
                  method: 'POST',
                  body: JSON.stringify([
                    { user_id: stranger.id, nickname: 'Theirs', odometer_km: 0, sort_order: 0 },
                  ]),
                })
              ).json()
            )[0].id,
            title: 'Theirs',
          },
        ]),
      })
    ).json())[0] as { id: string }

    const response = await call(stranger, 'mod_dependencies', {
      method: 'POST',
      body: JSON.stringify([{ mod_plan_id: theirs.id, depends_on_id: coilovers }]),
    })
    expect(response.ok).toBe(false)
  })

  it('refuses a mod that depends on itself', async () => {
    const response = await call(user, 'mod_dependencies', {
      method: 'POST',
      body: JSON.stringify([{ mod_plan_id: coilovers, depends_on_id: coilovers }]),
    })
    expect(response.ok).toBe(false)
    expect(await response.text()).toContain('mod_dependencies_no_self_check')
  })
})
