/**
 * Integration checks against the local Supabase stack.
 *
 * Two things are proved here, and neither can be proved without a database:
 *
 *  1. Row level security holds. Two users are created, the first fills every
 *     table, and the second is shown to see none of it -- not through the tables,
 *     not through the view, not through storage -- and to be unable to write into
 *     the first user's rows.
 *  2. `lib/budget.ts` agrees with `v_expense_impact` exactly. The view is the only
 *     implementation of amortisation in the database; if the client copy drifts,
 *     an optimistic total would settle to a different number after the round trip.
 *
 * Skipped unless the stack is up and GARAGE_DB_TESTS is set, so `npm test` stays
 * hermetic. Run it with `npm run test:db`.
 */

import { execFileSync } from 'node:child_process'

import { beforeAll, describe, expect, it } from 'vitest'

import { amortiseSlices } from '@/lib/budget'

const ENABLED = process.env.GARAGE_DB_TESTS === '1'

type Stack = { apiUrl: string; publishableKey: string; secretKey: string }
type User = { id: string; email: string; token: string }

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
let alice: User
let bob: User

async function createUser(label: string): Promise<User> {
  const email = `${label}-${Math.random().toString(36).slice(2, 10)}@garage.test`
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
  if (!created.ok) throw new Error(`admin create user failed: ${created.status} ${await created.text()}`)
  const { id } = (await created.json()) as { id: string }

  const signedIn = await fetch(`${stack.apiUrl}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: { apikey: stack.publishableKey, 'content-type': 'application/json' },
    body: JSON.stringify({ email, password }),
  })
  if (!signedIn.ok) throw new Error(`sign in failed: ${signedIn.status} ${await signedIn.text()}`)
  const { access_token: token } = (await signedIn.json()) as { access_token: string }

  return { id, email, token }
}

type RestResult = { status: number; body: unknown }

async function rest(user: User, path: string, init: RequestInit = {}): Promise<RestResult> {
  const response = await fetch(`${stack.apiUrl}/rest/v1/${path}`, {
    ...init,
    headers: {
      apikey: stack.publishableKey,
      authorization: `Bearer ${user.token}`,
      'content-type': 'application/json',
      prefer: 'return=representation',
      ...(init.headers ?? {}),
    },
  })
  const text = await response.text()
  return { status: response.status, body: text === '' ? [] : JSON.parse(text) }
}

async function insert(user: User, table: string, row: Record<string, unknown>): Promise<Record<string, unknown>> {
  const { status, body } = await rest(user, table, { method: 'POST', body: JSON.stringify(row) })
  if (status !== 201) throw new Error(`insert into ${table} failed: ${status} ${JSON.stringify(body)}`)
  const rows = body as Record<string, unknown>[]
  const first = rows[0]
  if (!first) throw new Error(`insert into ${table} returned no row`)
  return first
}

async function select(user: User, path: string): Promise<Record<string, unknown>[]> {
  const { status, body } = await rest(user, path)
  if (status !== 200) throw new Error(`select ${path} failed: ${status} ${JSON.stringify(body)}`)
  return body as Record<string, unknown>[]
}

/** Every table in the schema, and the column that carries its id. */
const TABLES = [
  'profiles',
  'vehicles',
  'categories',
  'expenses',
  'attachments',
  'mod_plans',
  'mod_dependencies',
  'service_schedules',
  'service_records',
  'fuel_logs',
  'parts',
  'timeline_notes',
  'milestones',
  'budgets',
  'funds',
  'fund_contributions',
  'recurring_expenses',
] as const

/** Ids Alice created, per table, so Bob can be checked against them precisely. */
const aliceRows: Record<string, string[]> = {}

describe.skipIf(!ENABLED)('local stack', () => {
  beforeAll(async () => {
    stack = readStack()
    alice = await createUser('alice')
    bob = await createUser('bob')

    const vehicle = await insert(alice, 'vehicles', {
      user_id: alice.id,
      nickname: 'RLS probe car',
      make: 'Probe',
      odometer_km: 12_000,
    })
    const vehicleId = vehicle.id as string
    aliceRows.vehicles = [vehicleId]
    aliceRows.profiles = [alice.id]

    const category = await insert(alice, 'categories', {
      user_id: alice.id,
      name: 'RLS probe category',
      icon: 'Wrench',
      colour_hex: '#578769',
      default_bucket: 'car_running',
      default_counts_toward_budget: true,
    })
    aliceRows.categories = [category.id as string]

    const expense = await insert(alice, 'expenses', {
      user_id: alice.id,
      occurred_on: '2026-08-25',
      amount: 100,
      currency: 'VND',
      category_id: category.id,
      vehicle_id: vehicleId,
      bucket: 'car_running',
      counts_toward_budget: true,
      amortize_months: 3,
      merchant: 'RLS probe',
    })
    aliceRows.expenses = [expense.id as string]

    const modA = await insert(alice, 'mod_plans', {
      user_id: alice.id,
      vehicle_id: vehicleId,
      title: 'RLS probe mod',
    })
    const modB = await insert(alice, 'mod_plans', {
      user_id: alice.id,
      vehicle_id: vehicleId,
      title: 'RLS probe blocker',
    })
    aliceRows.mod_plans = [modA.id as string, modB.id as string]

    const dependency = await insert(alice, 'mod_dependencies', {
      mod_plan_id: modA.id,
      depends_on_id: modB.id,
    })
    aliceRows.mod_dependencies = [dependency.mod_plan_id as string]

    const schedule = await insert(alice, 'service_schedules', {
      user_id: alice.id,
      vehicle_id: vehicleId,
      name: 'Engine oil and filter',
      interval_km: 5_000,
      interval_months: 6,
    })
    aliceRows.service_schedules = [schedule.id as string]

    const record = await insert(alice, 'service_records', {
      user_id: alice.id,
      vehicle_id: vehicleId,
      schedule_id: schedule.id,
      name: 'Engine oil and filter',
      performed_on: '2026-08-01',
      odometer_km: 11_500,
    })
    aliceRows.service_records = [record.id as string]

    const fill = await insert(alice, 'fuel_logs', {
      user_id: alice.id,
      vehicle_id: vehicleId,
      filled_on: '2026-08-20',
      odometer_km: 12_000,
      litres: 38.5,
      total_cost: 900_000,
      currency: 'VND',
    })
    aliceRows.fuel_logs = [fill.id as string]

    const part = await insert(alice, 'parts', {
      user_id: alice.id,
      vehicle_id: vehicleId,
      name: 'RLS probe part',
      mod_plan_id: modA.id,
    })
    aliceRows.parts = [part.id as string]

    const note = await insert(alice, 'timeline_notes', {
      user_id: alice.id,
      vehicle_id: vehicleId,
      occurred_on: '2026-08-24',
      title: 'RLS probe drive',
    })
    aliceRows.timeline_notes = [note.id as string]

    const milestone = await insert(alice, 'milestones', {
      user_id: alice.id,
      vehicle_id: vehicleId,
      kind: 'first_expense',
      achieved_on: '2026-08-25',
      title: 'First expense',
    })
    aliceRows.milestones = [milestone.id as string]

    const budget = await insert(alice, 'budgets', {
      user_id: alice.id,
      month: '2026-08-01',
      amount: 20_000_000,
      currency: 'VND',
    })
    aliceRows.budgets = [budget.id as string]

    const fund = await insert(alice, 'funds', {
      user_id: alice.id,
      name: 'RLS probe fund',
      target_amount: 30_000_000,
      currency: 'VND',
    })
    aliceRows.funds = [fund.id as string]

    const contribution = await insert(alice, 'fund_contributions', {
      user_id: alice.id,
      fund_id: fund.id,
      occurred_on: '2026-08-25',
      amount: 2_000_000,
    })
    aliceRows.fund_contributions = [contribution.id as string]

    const recurring = await insert(alice, 'recurring_expenses', {
      user_id: alice.id,
      label: 'RLS probe subscription',
      amount: 99_000,
      currency: 'VND',
      cadence: 'monthly',
      day_of_month: 1,
      next_due: '2026-09-01',
    })
    aliceRows.recurring_expenses = [recurring.id as string]

    const attachment = await insert(alice, 'attachments', {
      user_id: alice.id,
      storage_path: `${alice.id}/${vehicleId}/probe.webp`,
      bucket_name: 'receipts',
      kind: 'receipt',
      expense_id: expense.id,
    })
    aliceRows.attachments = [attachment.id as string]
  }, 120_000)

  it('gives a new user the fifteen system categories on first sign-in', async () => {
    const seeded = await select(bob, 'categories?is_system=eq.true&select=name,default_bucket,default_counts_toward_budget&order=sort_order')
    expect(seeded).toHaveLength(15)
    expect(seeded[0]).toEqual({ name: 'Fuel', default_bucket: 'car_running', default_counts_toward_budget: true })
    expect(seeded.filter((row) => row.default_bucket === 'car_project').every((row) => row.default_counts_toward_budget === false)).toBe(true)
  })

  it('gives a new user a profile with the Vietnamese defaults', async () => {
    const [profile] = await select(bob, 'profiles?select=id,base_currency,locale,timezone,default_view')
    expect(profile).toEqual({
      id: bob.id,
      base_currency: 'VND',
      locale: 'vi-VN',
      timezone: 'Asia/Ho_Chi_Minh',
      default_view: 'monthly',
    })
  })

  describe('amortisation parity with v_expense_impact', () => {
    const vehicleless = { bucket: 'life', vehicle_id: null }

    const probes = [
      { label: '100 over 3 months', amount: 100, amortize_months: 3, occurred_on: '2026-08-25' },
      { label: '1 over 12 months', amount: 1, amortize_months: 12, occurred_on: '2026-08-25' },
      { label: 'refund of 100 over 3 months', amount: -100, amortize_months: 3, occurred_on: '2026-08-25' },
      { label: 'refund of 1 over 12 months', amount: -1, amortize_months: 12, occurred_on: '2026-12-15' },
      { label: '24m over 24 months across a year end', amount: 24_000_000, amortize_months: 24, occurred_on: '2026-11-03' },
      { label: 'single month', amount: 150_000, amortize_months: 1, occurred_on: '2026-02-28' },
      { label: 'odd amount over 7 months', amount: 1_234_567, amortize_months: 7, occurred_on: '2027-01-31' },
    ]

    it.each(probes)('$label', async (probe) => {
      const expense = await insert(alice, 'expenses', {
        user_id: alice.id,
        occurred_on: probe.occurred_on,
        amount: probe.amount,
        currency: 'VND',
        counts_toward_budget: true,
        amortize_months: probe.amortize_months,
        ...vehicleless,
      })

      const fromView = await select(
        alice,
        `v_expense_impact?expense_id=eq.${expense.id}&select=impact_month,amount&order=impact_month`,
      )

      const fromLib = amortiseSlices({
        amount: probe.amount,
        occurred_on: probe.occurred_on,
        amortize_months: probe.amortize_months,
        counts_toward_budget: true,
      })

      expect(fromView).toEqual(fromLib)
    })

    it('leaves an expense that does not count toward the budget out of the view entirely', async () => {
      const expense = await insert(alice, 'expenses', {
        user_id: alice.id,
        occurred_on: '2026-08-25',
        amount: 24_000_000,
        currency: 'VND',
        counts_toward_budget: false,
        amortize_months: 24,
        ...vehicleless,
      })
      expect(await select(alice, `v_expense_impact?expense_id=eq.${expense.id}`)).toEqual([])
      expect(amortiseSlices({ amount: 24_000_000, occurred_on: '2026-08-25', amortize_months: 24, counts_toward_budget: false })).toEqual([])
    })

    it('leaves a draft out of the view until it is confirmed', async () => {
      const expense = await insert(alice, 'expenses', {
        user_id: alice.id,
        occurred_on: '2026-08-25',
        amount: 99_000,
        currency: 'VND',
        counts_toward_budget: true,
        amortize_months: 1,
        is_draft: true,
        ...vehicleless,
      })
      expect(await select(alice, `v_expense_impact?expense_id=eq.${expense.id}`)).toEqual([])
      expect(amortiseSlices({ amount: 99_000, occurred_on: '2026-08-25', amortize_months: 1, counts_toward_budget: true, is_draft: true })).toEqual([])
    })
  })

  describe('row level security', () => {
    it.each(TABLES)('shows the first user their own rows in %s', async (table) => {
      const idColumn = table === 'mod_dependencies' ? 'mod_plan_id' : 'id'
      const rows = await select(alice, `${table}?select=${idColumn}`)
      const visible = rows.map((row) => row[idColumn] as string)
      const mine = aliceRows[table] ?? []
      expect(mine.length).toBeGreaterThan(0)
      expect(mine.filter((id) => !visible.includes(id))).toEqual([])
    })

    it.each(TABLES)('shows the second user none of the first user\'s rows in %s', async (table) => {
      const idColumn = table === 'profiles' ? 'id' : table === 'mod_dependencies' ? 'mod_plan_id' : 'id'
      const rows = await select(bob, `${table}?select=${idColumn}`)
      const visible = rows.map((row) => row[idColumn] as string)
      const leaked = (aliceRows[table] ?? []).filter((id) => visible.includes(id))
      expect(leaked).toEqual([])
    })

    it('shows the second user none of the first user\'s budget impact', async () => {
      const rows = await select(bob, 'v_expense_impact?select=expense_id')
      expect(rows).toEqual([])
    })

    it('shows the second user only their own rows, which is fifteen categories and one profile', async () => {
      expect(await select(bob, 'vehicles?select=id')).toEqual([])
      expect(await select(bob, 'expenses?select=id')).toEqual([])
      expect(await select(bob, 'categories?select=id')).toHaveLength(15)
      expect(await select(bob, 'profiles?select=id')).toHaveLength(1)
    })

    it('refuses to let the second user write a row owned by the first', async () => {
      const attempt = await rest(bob, 'expenses', {
        method: 'POST',
        body: JSON.stringify({
          user_id: alice.id,
          occurred_on: '2026-08-25',
          amount: 1,
          bucket: 'life',
          counts_toward_budget: true,
        }),
      })
      expect(attempt.status).toBeGreaterThanOrEqual(400)
    })

    it('changes nothing when the second user updates or deletes the first user\'s expense', async () => {
      const id = aliceRows.expenses?.[0]
      const patched = await rest(bob, `expenses?id=eq.${id}`, {
        method: 'PATCH',
        body: JSON.stringify({ merchant: 'taken over' }),
      })
      expect(patched.body).toEqual([])

      const deleted = await rest(bob, `expenses?id=eq.${id}`, { method: 'DELETE' })
      expect(deleted.body).toEqual([])

      const [survivor] = await select(alice, `expenses?id=eq.${id}&select=merchant`)
      expect(survivor).toEqual({ merchant: 'RLS probe' })
    })

    it('keeps the first user\'s uploads out of the second user\'s reach', async () => {
      const path = `${alice.id}/probe.txt`
      const uploaded = await fetch(`${stack.apiUrl}/storage/v1/object/receipts/${path}`, {
        method: 'POST',
        headers: {
          apikey: stack.publishableKey,
          authorization: `Bearer ${alice.token}`,
          'content-type': 'text/plain',
        },
        body: 'receipt',
      })
      expect(uploaded.status).toBe(200)

      const mine = await fetch(`${stack.apiUrl}/storage/v1/object/receipts/${path}`, {
        headers: { apikey: stack.publishableKey, authorization: `Bearer ${alice.token}` },
      })
      expect(mine.status).toBe(200)

      const theirs = await fetch(`${stack.apiUrl}/storage/v1/object/receipts/${path}`, {
        headers: { apikey: stack.publishableKey, authorization: `Bearer ${bob.token}` },
      })
      expect(theirs.status).toBeGreaterThanOrEqual(400)

      const stolen = await fetch(`${stack.apiUrl}/storage/v1/object/receipts/${alice.id}/stolen.txt`, {
        method: 'POST',
        headers: {
          apikey: stack.publishableKey,
          authorization: `Bearer ${bob.token}`,
          'content-type': 'text/plain',
        },
        body: 'not yours',
      })
      expect(stolen.status).toBeGreaterThanOrEqual(400)
    })
  })
})
