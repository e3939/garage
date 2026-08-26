/**
 * The two things migration 0020 promises, checked against the stack.
 *
 * **`import_expenses` is all or nothing.** That is the only claim the import
 * screen makes that a person cannot verify for themselves, and it is the one
 * that matters: a half-finished import leaves a ledger nobody can trust and no
 * way to tell which half landed. Nothing in typecheck, lint or build can catch
 * it going wrong — it is a property of a transaction.
 *
 * **`v_vehicle_closing` is arithmetic somebody will screenshot.** A cost per km
 * that is wrong by a factor of the sale price is a number that gets shown to
 * other people.
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
let owner: User
let stranger: User
let vehicleId: string
let strangerVehicleId: string

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

async function rest(as: User, path: string, init: RequestInit = {}): Promise<unknown> {
  const response = await fetch(`${stack.apiUrl}/rest/v1/${path}`, {
    ...init,
    headers: {
      apikey: stack.publishableKey,
      authorization: `Bearer ${as.token}`,
      'content-type': 'application/json',
      prefer: 'return=representation',
      ...(init.headers ?? {}),
    },
  })
  const text = await response.text()
  if (!response.ok) throw new Error(`${path} failed: ${response.status} ${text}`)
  return text === '' ? [] : JSON.parse(text)
}

/** The RPC, called exactly as the server action calls it. */
async function importExpenses(
  as: User,
  categories: unknown[],
  expenses: unknown[],
): Promise<{ ok: true; result: Record<string, number> } | { ok: false; message: string }> {
  const response = await fetch(`${stack.apiUrl}/rest/v1/rpc/import_expenses`, {
    method: 'POST',
    headers: {
      apikey: stack.publishableKey,
      authorization: `Bearer ${as.token}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify({ p_categories: categories, p_expenses: expenses }),
  })
  const text = await response.text()
  if (!response.ok) return { ok: false, message: text }
  return { ok: true, result: JSON.parse(text) as Record<string, number> }
}

function uuid(): string {
  return crypto.randomUUID()
}

function expense(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: uuid(),
    occurred_on: '2026-08-26',
    amount: 150_000,
    currency: 'VND',
    category_id: null,
    vehicle_id: null,
    bucket: 'life',
    counts_toward_budget: true,
    amortize_months: 1,
    merchant: null,
    note: null,
    odometer_km: null,
    ...overrides,
  }
}

async function countExpenses(as: User): Promise<number> {
  const rows = (await rest(as, 'expenses?select=id')) as unknown[]
  return rows.length
}

describe.skipIf(!ENABLED)('import_expenses', () => {
  beforeAll(async () => {
    stack = readStack()
    owner = await createUser('import')
    stranger = await createUser('import-stranger')

    const vehicles = (await rest(owner, 'vehicles', {
      method: 'POST',
      body: JSON.stringify({
        user_id: owner.id,
        nickname: 'Import probe',
        purchase_date: '2024-08-26',
        purchase_price: 500_000_000,
        currency: 'VND',
        odometer_km: 40_000,
        purchase_odometer_km: 30_000,
      }),
    })) as { id: string }[]
    vehicleId = vehicles[0]!.id

    const theirs = (await rest(stranger, 'vehicles', {
      method: 'POST',
      body: JSON.stringify({
        user_id: stranger.id,
        nickname: 'Not yours',
        odometer_km: 1_000,
        purchase_odometer_km: 1_000,
      }),
    })) as { id: string }[]
    strangerVehicleId = theirs[0]!.id
  })

  it('creates the categories the file named and inserts its expenses', async () => {
    const categoryId = uuid()
    const before = await countExpenses(owner)

    const outcome = await importExpenses(
      owner,
      [
        {
          id: categoryId,
          name: 'Car wash',
          icon: 'DotsThree',
          colour_hex: '#6B6357',
          default_bucket: 'car_running',
          default_counts_toward_budget: true,
        },
      ],
      [
        expense({ category_id: categoryId, vehicle_id: vehicleId, bucket: 'car_running' }),
        expense({ occurred_on: '2026-08-27', amount: 90_000 }),
      ],
    )

    expect(outcome.ok).toBe(true)
    if (!outcome.ok) return

    expect(outcome.result.categories_created).toBe(1)
    expect(outcome.result.expenses_imported).toBe(2)
    expect(outcome.result.expenses_skipped).toBe(0)
    expect(await countExpenses(owner)).toBe(before + 2)

    const [category] = (await rest(owner, `categories?id=eq.${categoryId}&select=name,user_id`)) as {
      name: string
      user_id: string
    }[]
    expect(category?.name).toBe('Car wash')
    // The row is stamped with the caller, never with anything the client sent.
    expect(category?.user_id).toBe(owner.id)
  })

  it('is a no-op the second time the same file is imported', async () => {
    const rows = [expense(), expense({ occurred_on: '2026-09-02', amount: 42_000 })]

    const first = await importExpenses(owner, [], rows)
    expect(first.ok && first.result.expenses_imported).toBe(2)

    const before = await countExpenses(owner)
    const second = await importExpenses(owner, [], rows)

    expect(second.ok).toBe(true)
    if (!second.ok) return
    expect(second.result.expenses_imported).toBe(0)
    expect(second.result.expenses_skipped).toBe(2)
    expect(await countExpenses(owner)).toBe(before)
  })

  it('imports nothing at all when one row is bad', async () => {
    const before = await countExpenses(owner)

    // A car bucket with no vehicle. The check constraint refuses it, and the
    // transaction takes the two good rows down with it — which is the promise.
    const outcome = await importExpenses(owner, [], [
      expense(),
      expense({ occurred_on: '2026-09-03' }),
      expense({ bucket: 'car_project', vehicle_id: null }),
    ])

    expect(outcome.ok).toBe(false)
    expect(await countExpenses(owner)).toBe(before)
  })

  it('refuses a vehicle belonging to somebody else, and writes nothing', async () => {
    const before = await countExpenses(owner)

    const outcome = await importExpenses(
      owner,
      [],
      [expense(), expense({ vehicle_id: strangerVehicleId, bucket: 'car_running' })],
    )

    expect(outcome.ok).toBe(false)
    if (!outcome.ok) expect(outcome.message).toContain('unknown vehicle')
    expect(await countExpenses(owner)).toBe(before)
  })

  it('rolls the categories back too when the expenses fail', async () => {
    const categoryId = uuid()

    const outcome = await importExpenses(
      owner,
      [
        {
          id: categoryId,
          name: 'Never created',
          icon: 'DotsThree',
          colour_hex: '#6B6357',
          default_bucket: 'life',
          default_counts_toward_budget: true,
        },
      ],
      [expense({ bucket: 'car_running', vehicle_id: null })],
    )

    expect(outcome.ok).toBe(false)
    expect(await rest(owner, `categories?id=eq.${categoryId}&select=id`)).toEqual([])
  })

  it('keeps a row whose id a stranger already holds, under an id of its own', async () => {
    // The stranger writes a row; the file being imported carries that same id,
    // which is what happens when two accounts in one database import the same
    // export. A primary key is global and RLS is not, so `on conflict do
    // nothing` alone would drop the row in silence.
    const shared = uuid()
    await rest(stranger, 'expenses', {
      method: 'POST',
      body: JSON.stringify({
        user_id: stranger.id,
        occurred_on: '2026-08-26',
        amount: 1,
        currency: 'VND',
        bucket: 'life',
        counts_toward_budget: true,
        id: shared,
      }),
    })

    const before = await countExpenses(owner)
    const outcome = await importExpenses(owner, [], [expense({ id: shared, amount: 777_000 })])

    expect(outcome.ok).toBe(true)
    if (!outcome.ok) return
    expect(outcome.result.expenses_imported).toBe(1)
    expect(outcome.result.expenses_reassigned).toBe(1)
    expect(await countExpenses(owner)).toBe(before + 1)

    // The stranger's row is untouched.
    const [theirs] = (await rest(stranger, `expenses?id=eq.${shared}&select=amount`)) as {
      amount: number
    }[]
    expect(theirs?.amount).toBe(1)

    // And importing the same file again still changes nothing: the id the row
    // was given is derived from the one in the file, not minted at random.
    const again = await importExpenses(owner, [], [expense({ id: shared, amount: 777_000 })])
    expect(again.ok).toBe(true)
    if (!again.ok) return
    expect(again.result.expenses_imported).toBe(0)
    expect(await countExpenses(owner)).toBe(before + 1)
  })

  it('leaves an imported row invisible to a second user', async () => {
    const id = uuid()
    await importExpenses(owner, [], [expense({ id })])
    expect(await rest(stranger, `expenses?id=eq.${id}&select=id`)).toEqual([])
  })
})

describe.skipIf(!ENABLED)('v_vehicle_closing', () => {
  let closingUser: User
  let closingVehicleId: string

  beforeAll(async () => {
    stack = readStack()
    closingUser = await createUser('closing')

    const vehicles = (await rest(closingUser, 'vehicles', {
      method: 'POST',
      body: JSON.stringify({
        user_id: closingUser.id,
        nickname: 'Closing probe',
        purchase_date: '2024-08-01',
        purchase_price: 400_000_000,
        currency: 'VND',
        odometer_km: 30_000,
        purchase_odometer_km: 10_000,
      }),
    })) as { id: string }[]
    closingVehicleId = vehicles[0]!.id

    await rest(closingUser, 'expenses', {
      method: 'POST',
      body: JSON.stringify([
        {
          user_id: closingUser.id,
          vehicle_id: closingVehicleId,
          occurred_on: '2025-01-05',
          amount: 60_000_000,
          currency: 'VND',
          bucket: 'car_running',
          counts_toward_budget: true,
        },
        {
          user_id: closingUser.id,
          vehicle_id: closingVehicleId,
          occurred_on: '2025-06-05',
          amount: 40_000_000,
          currency: 'VND',
          bucket: 'car_project',
          counts_toward_budget: false,
        },
      ]),
    })

    await rest(closingUser, 'mod_plans', {
      method: 'POST',
      body: JSON.stringify([
        {
          user_id: closingUser.id,
          vehicle_id: closingVehicleId,
          title: 'Coilovers',
          status: 'installed',
          installed_on: '2025-06-05',
        },
        {
          user_id: closingUser.id,
          vehicle_id: closingVehicleId,
          title: 'Wheels',
          status: 'dreaming',
          installed_on: null,
        },
      ]),
    })
  })

  async function closing(): Promise<Record<string, number | string | null>> {
    const [row] = (await rest(
      closingUser,
      `v_vehicle_closing?vehicle_id=eq.${closingVehicleId}&select=*`,
    )) as Record<string, number | string | null>[]
    return row!
  }

  it('adds the purchase price to the spend and divides by the distance', async () => {
    const row = await closing()

    expect(row.total_spend).toBe(100_000_000)
    expect(row.running_spend).toBe(60_000_000)
    expect(row.project_spend).toBe(40_000_000)
    // 400m purchase + 100m spend.
    expect(row.total_invested).toBe(500_000_000)
    // 30,000 now, bought at 10,000.
    expect(row.km_driven).toBe(20_000)
    expect(row.cost_per_km).toBe(25_000)
    expect(row.mods_installed).toBe(1)
    expect(row.expense_count).toBe(2)
    // Not sold yet: nothing has come back out.
    expect(row.sold_price).toBe(null)
    expect(row.net_cost).toBe(500_000_000)
  })

  it('nets the sale off, and measures the months to the day of it', async () => {
    await rest(closingUser, `vehicles?id=eq.${closingVehicleId}`, {
      method: 'PATCH',
      body: JSON.stringify({
        status: 'sold',
        sold_date: '2026-08-01',
        sold_price: 300_000_000,
        archived_at: new Date().toISOString(),
      }),
    })

    const row = await closing()

    expect(row.status).toBe('sold')
    expect(row.sold_price).toBe(300_000_000)
    // 500m in, 300m back out.
    expect(row.net_cost).toBe(200_000_000)
    expect(row.net_cost_per_km).toBe(10_000)
    // The cost per km before the sale does not move.
    expect(row.cost_per_km).toBe(25_000)
    // 1 August 2024 to 1 August 2026, measured to the sale rather than to today.
    expect(row.months_owned).toBe(24)
  })

  it('is invisible to a second user', async () => {
    const other = await createUser('closing-stranger')
    expect(
      await rest(other, `v_vehicle_closing?vehicle_id=eq.${closingVehicleId}&select=vehicle_id`),
    ).toEqual([])
  })
})
