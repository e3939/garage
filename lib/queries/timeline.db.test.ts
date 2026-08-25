/**
 * Integration checks for the timeline, against the local stack.
 *
 * The phase's acceptance criterion — "a month of real activity produces a feed
 * worth scrolling" — is a judgement a person makes. What can be proved here is
 * everything that judgement depends on: that the feed holds each kind of thing
 * exactly once, that a keyset page neither repeats nor drops a row, that a
 * month of fill-ups is one row rather than six, that photos arrive attached to
 * the right entry, and that none of it is visible to anybody else.
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

type Photo = {
  id: string
  storage_path: string
  bucket_name: string
  caption: string | null
  sort_order: number
}

type Fill = { ref_id: string; occurred_on: string; title: string; amount: number }

type PageRow = {
  ref_id: string
  kind: string
  occurred_on: string
  created_at: string
  title: string
  subtitle: string | null
  amount: number | null
  currency: string | null
  items: Fill[]
  photos: Photo[]
}

async function page(
  as: User,
  vehicleId: string,
  limit = 30,
  cursor?: { occurred_on: string; created_at: string; ref_id: string },
): Promise<PageRow[]> {
  const response = await call(as, 'rpc/timeline_page', {
    method: 'POST',
    body: JSON.stringify({
      p_vehicle_id: vehicleId,
      p_limit: limit,
      p_cursor_occurred_on: cursor?.occurred_on ?? null,
      p_cursor_created_at: cursor?.created_at ?? null,
      p_cursor_id: cursor?.ref_id ?? null,
    }),
  })
  const text = await response.text()
  if (!response.ok) throw new Error(`timeline_page failed: ${response.status} ${text}`)
  return JSON.parse(text) as PageRow[]
}

// ---------------------------------------------------------------------------
// The fixture: one car and a month that actually happened to it.
// ---------------------------------------------------------------------------

const FUEL_MONTH = '2026-05'
const FILLS = [
  { filled_on: '2026-05-02', odometer_km: 40_100, litres: 38.2, total_cost: 720_000 },
  { filled_on: '2026-05-09', odometer_km: 40_520, litres: 36.9, total_cost: 690_000 },
  { filled_on: '2026-05-17', odometer_km: 40_980, litres: 39.4, total_cost: 745_000 },
  { filled_on: '2026-05-26', odometer_km: 41_400, litres: 37.1, total_cost: 700_000 },
]
const FUEL_TOTAL = FILLS.reduce((sum, fill) => sum + fill.total_cost, 0)

let vehicleId: string
let otherVehicleId: string
let noteId: string
let expenseId: string
let draftExpenseId: string
let installedModId: string
let archivedModId: string
let serviceId: string
let milestoneId: string

describe.skipIf(!ENABLED)('Phase 4 timeline', () => {
  beforeAll(async () => {
    stack = readStack()
    user = await createUser('timeline')
    stranger = await createUser('timeline-stranger')

    const vehicles = (await rest('vehicles', {
      method: 'POST',
      body: JSON.stringify([
        { user_id: user.id, nickname: 'Feed probe', odometer_km: 40_000, sort_order: 0 },
        { user_id: user.id, nickname: 'Other car', odometer_km: 1_000, sort_order: 1 },
      ]),
    })) as { id: string }[]
    vehicleId = vehicles[0]!.id
    otherVehicleId = vehicles[1]!.id

    const expenses = (await rest('expenses', {
      method: 'POST',
      body: JSON.stringify([
        {
          user_id: user.id,
          vehicle_id: vehicleId,
          occurred_on: '2026-05-20',
          amount: 12_000_000,
          currency: 'VND',
          bucket: 'car_project',
          counts_toward_budget: false,
          merchant: 'Tyre shop',
          is_draft: false,
        },
        {
          user_id: user.id,
          vehicle_id: vehicleId,
          occurred_on: '2026-05-21',
          amount: 400_000,
          currency: 'VND',
          bucket: 'car_running',
          counts_toward_budget: true,
          merchant: 'Awaiting confirmation',
          is_draft: true,
        },
        {
          user_id: user.id,
          vehicle_id: null,
          occurred_on: '2026-05-20',
          amount: 150_000,
          currency: 'VND',
          bucket: 'life',
          counts_toward_budget: true,
          merchant: 'Groceries',
          is_draft: false,
        },
        {
          user_id: user.id,
          vehicle_id: vehicleId,
          occurred_on: '2026-05-14',
          amount: 900_000,
          currency: 'VND',
          bucket: 'car_running',
          counts_toward_budget: true,
          merchant: 'Workshop',
          is_draft: false,
        },
      ]),
    })) as { id: string; is_draft: boolean; merchant: string }[]
    expenseId = expenses.find((row) => row.merchant === 'Tyre shop')!.id
    draftExpenseId = expenses.find((row) => row.is_draft)!.id
    const serviceExpenseId = expenses.find((row) => row.merchant === 'Workshop')!.id

    const notes = (await rest('timeline_notes', {
      method: 'POST',
      body: JSON.stringify({
        user_id: user.id,
        vehicle_id: vehicleId,
        occurred_on: '2026-05-24',
        title: 'Sunday drive to Ba Vi',
        body: 'Two hundred kilometres and nothing broke.',
        odometer_km: 41_200,
      }),
    })) as { id: string }[]
    noteId = notes[0]!.id

    const mods = (await rest('mod_plans', {
      method: 'POST',
      body: JSON.stringify([
        {
          user_id: user.id,
          vehicle_id: vehicleId,
          title: 'Coilovers',
          status: 'installed',
          installed_on: '2026-05-11',
          archived_at: null,
        },
        {
          user_id: user.id,
          vehicle_id: vehicleId,
          title: 'Abandoned idea',
          status: 'dreaming',
          installed_on: null,
          archived_at: new Date().toISOString(),
        },
      ]),
    })) as { id: string; title: string }[]
    installedModId = mods.find((row) => row.title === 'Coilovers')!.id
    archivedModId = mods.find((row) => row.title === 'Abandoned idea')!.id

    const services = (await rest('service_records', {
      method: 'POST',
      body: JSON.stringify({
        user_id: user.id,
        vehicle_id: vehicleId,
        name: 'Engine oil and filter',
        performed_on: '2026-05-14',
        odometer_km: 40_800,
        workshop: 'Garage Duc Anh',
        expense_id: serviceExpenseId,
      }),
    })) as { id: string }[]
    serviceId = services[0]!.id

    const milestones = (await rest('milestones', {
      method: 'POST',
      body: JSON.stringify({
        user_id: user.id,
        vehicle_id: vehicleId,
        kind: 'km_40000',
        achieved_on: '2026-05-03',
        title: '40,000 km',
        auto: true,
      }),
    })) as { id: string }[]
    milestoneId = milestones[0]!.id

    await rest('fuel_logs', {
      method: 'POST',
      body: JSON.stringify(
        FILLS.map((fill) => ({
          user_id: user.id,
          vehicle_id: vehicleId,
          station: 'Petrolimex',
          currency: 'VND',
          ...fill,
        })),
      ),
    })

    // One fill in a different month, so the grouping has a boundary to respect.
    await rest('fuel_logs', {
      method: 'POST',
      body: JSON.stringify({
        user_id: user.id,
        vehicle_id: vehicleId,
        station: 'Petrolimex',
        currency: 'VND',
        filled_on: '2026-04-28',
        odometer_km: 39_700,
        litres: 35,
        total_cost: 660_000,
      }),
    })

    await rest('attachments', {
      method: 'POST',
      body: JSON.stringify([
        {
          user_id: user.id,
          timeline_note_id: noteId,
          storage_path: `${user.id}/${vehicleId}/aaaaaaaa-1111-4111-8111-111111111111.webp`,
          bucket_name: 'vehicles',
          kind: 'progress',
          caption: 'On the pass',
          sort_order: 1,
        },
        {
          user_id: user.id,
          timeline_note_id: noteId,
          storage_path: `${user.id}/${vehicleId}/bbbbbbbb-1111-4111-8111-111111111111.webp`,
          bucket_name: 'vehicles',
          kind: 'progress',
          caption: null,
          sort_order: 0,
        },
      ]),
    })

    await rest('attachments', {
      method: 'POST',
      body: JSON.stringify({
        user_id: user.id,
        expense_id: expenseId,
        storage_path: `${user.id}/${vehicleId}/cccccccc-1111-4111-8111-111111111111.webp`,
        bucket_name: 'receipts',
        kind: 'receipt',
        caption: 'Receipt',
        sort_order: 0,
      }),
    })
  })

  // -------------------------------------------------------------------------
  // v_timeline — the contract in docs/02-DATA-MODEL.md
  // -------------------------------------------------------------------------

  it('holds every kind of thing that happened to the car', async () => {
    const rows = (await rest(
      `v_timeline?vehicle_id=eq.${vehicleId}&select=kind,ref_id`,
    )) as { kind: string; ref_id: string }[]

    const kinds = new Set(rows.map((row) => row.kind))
    expect([...kinds].sort()).toEqual(['expense', 'fuel', 'milestone', 'mod', 'note', 'service'])
    expect(rows.filter((row) => row.kind === 'fuel')).toHaveLength(FILLS.length + 1)
  })

  it('leaves out drafts and archived mods, and other cars', async () => {
    const rows = (await rest(`v_timeline?vehicle_id=eq.${vehicleId}&select=ref_id`)) as {
      ref_id: string
    }[]
    const ids = new Set(rows.map((row) => row.ref_id))

    expect(ids.has(expenseId)).toBe(true)
    expect(ids.has(draftExpenseId)).toBe(false)
    expect(ids.has(archivedModId)).toBe(false)
    expect(ids.has(installedModId)).toBe(true)
    expect(ids.has(milestoneId)).toBe(true)
    expect(ids.has(serviceId)).toBe(true)
    expect(ids.has(noteId)).toBe(true)
  })

  it('dates an installed mod by the day it went on, not the day it was dreamt up', async () => {
    const rows = (await rest(
      `v_timeline?ref_id=eq.${installedModId}&select=occurred_on,subtitle`,
    )) as { occurred_on: string; subtitle: string }[]
    expect(rows[0]?.occurred_on).toBe('2026-05-11')
    expect(rows[0]?.subtitle).toBe('Installed')
  })

  it('gives a service record the amount of the expense it is linked to', async () => {
    const rows = (await rest(`v_timeline?ref_id=eq.${serviceId}&select=amount,subtitle`)) as {
      amount: number
      subtitle: string
    }[]
    expect(rows[0]?.amount).toBe(900_000)
    expect(rows[0]?.subtitle).toContain('Garage Duc Anh')
  })

  it('has no life expense on a vehicle feed', async () => {
    const rows = (await rest(
      `v_timeline?vehicle_id=eq.${vehicleId}&select=title`,
    )) as { title: string }[]
    expect(rows.map((row) => row.title)).not.toContain('Groceries')
  })

  // -------------------------------------------------------------------------
  // timeline_page
  // -------------------------------------------------------------------------

  it('collapses a month of fill-ups into one row that carries each fill', async () => {
    const rows = await page(user, vehicleId)
    const fuelRows = rows.filter((row) => row.kind === 'fuel')

    // Five fills across two months become two rows.
    expect(fuelRows).toHaveLength(2)

    const may = fuelRows.find((row) => row.occurred_on.startsWith(FUEL_MONTH))
    expect(may?.title).toBe('4 fill-ups')
    expect(may?.amount).toBe(FUEL_TOTAL)
    expect(may?.items).toHaveLength(4)
    expect(may?.occurred_on).toBe('2026-05-26')

    const april = fuelRows.find((row) => row.occurred_on.startsWith('2026-04'))
    expect(april?.title).toBe('1 fill-up')
    expect(april?.items).toHaveLength(1)
  })

  it('orders newest first', async () => {
    const rows = await page(user, vehicleId)
    const dates = rows.map((row) => row.occurred_on)
    expect([...dates].sort().reverse()).toEqual(dates)
  })

  it('pages by keyset with no repeats and no drops', async () => {
    const whole = await page(user, vehicleId, 100)
    expect(whole.length).toBeGreaterThan(4)

    const collected: PageRow[] = []
    let cursor: { occurred_on: string; created_at: string; ref_id: string } | undefined

    for (let guard = 0; guard < 20; guard += 1) {
      const chunk = await page(user, vehicleId, 2, cursor)
      if (chunk.length === 0) break
      collected.push(...chunk)
      const last = chunk[chunk.length - 1]!
      cursor = {
        occurred_on: last.occurred_on,
        created_at: last.created_at,
        ref_id: last.ref_id,
      }
      if (chunk.length < 2) break
    }

    expect(collected.map((row) => row.ref_id)).toEqual(whole.map((row) => row.ref_id))
    expect(new Set(collected.map((row) => row.ref_id)).size).toBe(collected.length)
  })

  it('brings each row its own photos, in sort order', async () => {
    const rows = await page(user, vehicleId, 100)

    const note = rows.find((row) => row.ref_id === noteId)
    expect(note?.photos).toHaveLength(2)
    expect(note?.photos.map((photo) => photo.sort_order)).toEqual([0, 1])
    expect(note?.photos[1]?.caption).toBe('On the pass')
    expect(note?.photos.every((photo) => photo.bucket_name === 'vehicles')).toBe(true)

    const expense = rows.find((row) => row.ref_id === expenseId)
    expect(expense?.photos).toHaveLength(1)
    expect(expense?.photos[0]?.bucket_name).toBe('receipts')

    const mod = rows.find((row) => row.ref_id === installedModId)
    expect(mod?.photos).toEqual([])
  })

  it('is empty for a car with nothing on it', async () => {
    expect(await page(user, otherVehicleId)).toEqual([])
  })

  // -------------------------------------------------------------------------
  // RLS
  // -------------------------------------------------------------------------

  it('shows another user nothing, even when they know the vehicle id', async () => {
    expect(await page(stranger, vehicleId)).toEqual([])

    const response = await call(stranger, `v_timeline?vehicle_id=eq.${vehicleId}&select=ref_id`)
    expect(response.ok).toBe(true)
    expect(await response.json()).toEqual([])
  })

  it('does not let another user read the attachment rows either', async () => {
    const response = await call(stranger, `attachments?timeline_note_id=eq.${noteId}&select=id`)
    expect(response.ok).toBe(true)
    expect(await response.json()).toEqual([])
  })
})
