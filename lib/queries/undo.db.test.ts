/**
 * The assumption the whole undo mechanism rests on, checked against the stack.
 *
 * `app/(app)/undo` photographs rows with `select *` and puts them back with an
 * `insert`. That round trip is only safe if every column a delete removes is a
 * column an insert accepts — no generated columns, no server-side defaults that
 * would overwrite the original, and an `id` and `created_at` that survive,
 * because the id is what every foreign key points at and `created_at` is half
 * of the ledger's keyset order.
 *
 * Nothing in typecheck, lint or build can catch that going wrong: it is a
 * property of the schema, and the first sign of it breaking would be an Undo
 * that quietly does nothing.
 *
 * Skipped unless GARAGE_DB_TESTS is set. Run with `npm run test:db`.
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
let vehicleId: string

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

async function rest(path: string, init: RequestInit = {}): Promise<unknown> {
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
  if (!response.ok) throw new Error(`${path} failed: ${response.status} ${text}`)
  return text === '' ? [] : JSON.parse(text)
}

type Row = Record<string, unknown>

/** Photograph, delete, put back — the exact sequence the undo performs. */
async function roundTrip(table: string, id: string): Promise<{ before: Row; after: Row }> {
  const [before] = (await rest(`${table}?id=eq.${id}&select=*`)) as Row[]
  expect(before, `${table} row to photograph`).toBeTruthy()

  await rest(`${table}?id=eq.${id}`, { method: 'DELETE' })
  expect(await rest(`${table}?id=eq.${id}&select=id`)).toEqual([])

  await rest(table, { method: 'POST', body: JSON.stringify([before]) })

  const [after] = (await rest(`${table}?id=eq.${id}&select=*`)) as Row[]
  return { before: before as Row, after: after as Row }
}

describe.skipIf(!ENABLED)('undo snapshots', () => {
  beforeAll(async () => {
    stack = readStack()
    user = await createUser('undo')

    const vehicles = (await rest('vehicles', {
      method: 'POST',
      body: JSON.stringify({
        user_id: user.id,
        nickname: 'Undo probe',
        odometer_km: 30_000,
        purchase_odometer_km: 30_000,
      }),
    })) as { id: string }[]
    vehicleId = vehicles[0]!.id
  })

  it('round-trips a fuel log unchanged, id and created_at included', async () => {
    const [log] = (await rest('fuel_logs', {
      method: 'POST',
      body: JSON.stringify({
        user_id: user.id,
        vehicle_id: vehicleId,
        filled_on: '2026-04-04',
        odometer_km: 30_100,
        litres: 38.5,
        total_cost: 900_000,
        currency: 'VND',
        station: 'Petrolimex',
      }),
    })) as { id: string }[]

    const { before, after } = await roundTrip('fuel_logs', log!.id)
    expect(after).toEqual(before)
  })

  it('round-trips a part', async () => {
    const [part] = (await rest('parts', {
      method: 'POST',
      body: JSON.stringify({
        user_id: user.id,
        vehicle_id: vehicleId,
        name: 'Undo probe part',
        brand: 'Ohlins',
        status: 'on_car',
      }),
    })) as { id: string }[]

    const { before, after } = await roundTrip('parts', part!.id)
    expect(after).toEqual(before)
  })

  it('round-trips a service record', async () => {
    const [record] = (await rest('service_records', {
      method: 'POST',
      body: JSON.stringify({
        user_id: user.id,
        vehicle_id: vehicleId,
        name: 'Engine oil and filter',
        performed_on: '2026-05-05',
        odometer_km: 30_200,
        workshop: 'Somewhere',
      }),
    })) as { id: string }[]

    const { before, after } = await roundTrip('service_records', record!.id)
    expect(after).toEqual(before)
  })

  it('round-trips a recurring template', async () => {
    const [template] = (await rest('recurring_expenses', {
      method: 'POST',
      body: JSON.stringify({
        user_id: user.id,
        label: 'Insurance',
        cadence: 'yearly',
        next_due: '2027-01-01',
        amount: 5_000_000,
        currency: 'VND',
        bucket: 'life',
        counts_toward_budget: true,
      }),
    })) as { id: string }[]

    const { before, after } = await roundTrip('recurring_expenses', template!.id)
    expect(after).toEqual(before)
  })

  it('round-trips a fund and the contributions that cascaded with it', async () => {
    const [fund] = (await rest('funds', {
      method: 'POST',
      body: JSON.stringify({
        user_id: user.id,
        name: 'Wheels',
        target_amount: 30_000_000,
        monthly_contribution: 2_000_000,
        currency: 'VND',
      }),
    })) as { id: string }[]
    expect(fund).toBeTruthy()
    const fundId = fund!.id

    const contributions = (await rest('fund_contributions', {
      method: 'POST',
      body: JSON.stringify([
        { user_id: user.id, fund_id: fundId, occurred_on: '2026-03-01', amount: 2_000_000 },
        { user_id: user.id, fund_id: fundId, occurred_on: '2026-04-01', amount: 2_000_000 },
      ]),
    })) as { id: string }[]

    const fundBefore = (await rest(`funds?id=eq.${fundId}&select=*`)) as Row[]
    const givenBefore = (await rest(
      `fund_contributions?fund_id=eq.${fundId}&select=*&order=occurred_on`,
    )) as Row[]
    expect(givenBefore).toHaveLength(2)

    // Deleting the fund cascades its contributions away, which is why the
    // snapshot carries both and puts the fund back first.
    await rest(`funds?id=eq.${fundId}`, { method: 'DELETE' })
    expect(await rest(`fund_contributions?fund_id=eq.${fundId}&select=id`)).toEqual([])

    await rest('funds', { method: 'POST', body: JSON.stringify(fundBefore) })
    await rest('fund_contributions', { method: 'POST', body: JSON.stringify(givenBefore) })

    expect(await rest(`funds?id=eq.${fundId}&select=*`)).toEqual(fundBefore)
    expect(
      await rest(`fund_contributions?fund_id=eq.${fundId}&select=*&order=occurred_on`),
    ).toEqual(givenBefore)
    expect(contributions).toHaveLength(2)
  })

  it('round-trips an expense with its attachment rows', async () => {
    const [expense] = (await rest('expenses', {
      method: 'POST',
      body: JSON.stringify({
        user_id: user.id,
        vehicle_id: vehicleId,
        occurred_on: '2026-06-06',
        amount: 750_000,
        currency: 'VND',
        bucket: 'car_running',
        counts_toward_budget: true,
        merchant: 'Undo probe',
        is_draft: false,
      }),
    })) as { id: string }[]
    expect(expense).toBeTruthy()
    const expenseId = expense!.id

    await rest('attachments', {
      method: 'POST',
      body: JSON.stringify({
        user_id: user.id,
        expense_id: expenseId,
        storage_path: `${user.id}/receipts/undo-probe.jpg`,
        bucket_name: 'receipts',
        kind: 'receipt',
        sort_order: 0,
      }),
    })

    const expenseBefore = (await rest(`expenses?id=eq.${expenseId}&select=*`)) as Row[]
    const photosBefore = (await rest(
      `attachments?expense_id=eq.${expenseId}&select=*`,
    )) as Row[]
    expect(photosBefore).toHaveLength(1)

    await rest(`expenses?id=eq.${expenseId}`, { method: 'DELETE' })
    expect(await rest(`attachments?expense_id=eq.${expenseId}&select=id`)).toEqual([])

    await rest('expenses', { method: 'POST', body: JSON.stringify(expenseBefore) })
    await rest('attachments', { method: 'POST', body: JSON.stringify(photosBefore) })

    expect(await rest(`expenses?id=eq.${expenseId}&select=*`)).toEqual(expenseBefore)
    expect(await rest(`attachments?expense_id=eq.${expenseId}&select=*`)).toEqual(photosBefore)
  })
})
