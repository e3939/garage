/**
 * Integration checks for the Phase 2 read paths, against the local stack.
 *
 * These prove the things that cannot be proved without Postgres: that
 * `ledger_page` pages by keyset without dropping or repeating a row, that its
 * day subtotal is the whole day rather than the part of it on the page, that
 * every filter narrows what it claims to, and that the monthly figure and the
 * amortisation threshold come out of SQL with the numbers the UI expects.
 *
 * Skipped unless GARAGE_DB_TESTS is set, so `npm test` stays hermetic.
 * Run with `npm run test:db`.
 */

import { beforeAll, describe, expect, it } from 'vitest'

import { DB_TESTS_ENABLED, readStack, type Stack } from '@/lib/supabase/test-stack'


type User = { id: string; token: string }

let stack: Stack
let user: User

async function createUser(): Promise<User> {
  const email = `ledger-${Math.random().toString(36).slice(2, 10)}@garage.test`
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

type LedgerArgs = Record<string, unknown>
type Row = {
  id: string
  occurred_on: string
  amount: number
  created_at: string
  day_total: number
  day_count: number
  category_name: string | null
  vehicle_nickname: string | null
  attachment_count: number
  bucket: string
  merchant: string | null
}

async function ledgerPage(args: LedgerArgs): Promise<Row[]> {
  return (await rest('rpc/ledger_page', {
    method: 'POST',
    body: JSON.stringify(args),
  })) as Row[]
}

/** Days are relative to the database's own `current_date`, not the test host's. */
function isoDaysAgo(days: number): string {
  const date = new Date()
  date.setUTCDate(date.getUTCDate() - days)
  return date.toISOString().slice(0, 10)
}

const DAY_A = isoDaysAgo(2)
const DAY_B = isoDaysAgo(1)

let vehicleId: string
let fuelId: string
let groceriesId: string
let modsId: string
const created: Record<string, string> = {}

async function addExpense(
  key: string,
  row: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  const rows = (await rest('expenses', {
    method: 'POST',
    body: JSON.stringify({ user_id: user.id, currency: 'VND', ...row }),
  })) as Record<string, unknown>[]
  const first = rows[0]
  if (!first) throw new Error('insert returned no row')
  created[key] = first.id as string
  return first
}

describe.skipIf(!DB_TESTS_ENABLED)('Phase 2 read paths', () => {
  beforeAll(async () => {
    stack = readStack()
    user = await createUser()

    const vehicles = (await rest('vehicles', {
      method: 'POST',
      body: JSON.stringify({ user_id: user.id, nickname: 'Ledger probe', odometer_km: 40_000 }),
    })) as { id: string }[]
    vehicleId = vehicles[0]!.id

    const categories = (await rest('categories?select=id,name')) as { id: string; name: string }[]
    const byName = new Map(categories.map((entry) => [entry.name, entry.id]))
    fuelId = byName.get('Fuel')!
    groceriesId = byName.get('Groceries')!
    modsId = byName.get('Mods & Parts')!

    // Day A: three expenses, one of them a car project spend kept out of budget.
    await addExpense('a1', {
      occurred_on: DAY_A,
      amount: 100_000,
      category_id: groceriesId,
      bucket: 'life',
      counts_toward_budget: true,
      merchant: 'Co.opmart',
      note: 'weekly shop',
    })
    await addExpense('a2', {
      occurred_on: DAY_A,
      amount: 250_000,
      category_id: fuelId,
      vehicle_id: vehicleId,
      bucket: 'car_running',
      counts_toward_budget: true,
      merchant: 'Petrolimex',
    })
    await addExpense('a3', {
      occurred_on: DAY_A,
      amount: 24_000_000,
      category_id: modsId,
      vehicle_id: vehicleId,
      bucket: 'car_project',
      counts_toward_budget: false,
      note: 'coilovers',
    })

    // Day B: two more, one spread over three months, one a draft.
    await addExpense('b1', {
      occurred_on: DAY_B,
      amount: 100,
      category_id: fuelId,
      vehicle_id: vehicleId,
      bucket: 'car_running',
      counts_toward_budget: true,
      amortize_months: 3,
    })
    await addExpense('b2', {
      occurred_on: DAY_B,
      amount: 999_000,
      category_id: groceriesId,
      bucket: 'life',
      counts_toward_budget: true,
      is_draft: true,
    })

    // One attachment, so the has-photo filter has something to find.
    await rest('attachments', {
      method: 'POST',
      body: JSON.stringify({
        user_id: user.id,
        storage_path: `${user.id}/receipt.webp`,
        bucket_name: 'receipts',
        kind: 'receipt',
        expense_id: created.a2,
      }),
    })
  }, 60_000)

  describe('ledger_page', () => {
    it('returns the newest day first and hides drafts', async () => {
      const rows = await ledgerPage({ p_limit: 50 })
      expect(rows.map((row) => row.id)).toEqual([
        created.b1,
        created.a3,
        created.a2,
        created.a1,
      ])
    })

    it('gives every row of a day the whole day subtotal', async () => {
      const rows = await ledgerPage({ p_limit: 50 })
      const dayA = rows.filter((row) => row.occurred_on === DAY_A)
      expect(dayA).toHaveLength(3)
      for (const row of dayA) {
        expect(row.day_total).toBe(24_350_000)
        expect(row.day_count).toBe(3)
      }
    })

    it('keeps the day subtotal whole when the day straddles a page boundary', async () => {
      const first = await ledgerPage({ p_limit: 2 })
      const last = first[first.length - 1]!
      const second = await ledgerPage({
        p_limit: 2,
        p_cursor_occurred_on: last.occurred_on,
        p_cursor_created_at: last.created_at,
        p_cursor_id: last.id,
      })

      // Day A is split two rows / one row, and both pages agree about it.
      expect(first.map((row) => row.id)).toEqual([created.b1, created.a3])
      expect(second.map((row) => row.id)).toEqual([created.a2, created.a1])
      expect(second[0]!.day_total).toBe(24_350_000)
      expect(first[1]!.day_total).toBe(24_350_000)
    })

    it('pages by keyset without repeating or dropping a row', async () => {
      const seen: string[] = []
      let cursor: Row | undefined

      for (let page = 0; page < 5; page += 1) {
        const rows: Row[] = await ledgerPage({
          p_limit: 2,
          p_cursor_occurred_on: cursor?.occurred_on,
          p_cursor_created_at: cursor?.created_at,
          p_cursor_id: cursor?.id,
        })
        if (rows.length === 0) break
        seen.push(...rows.map((row) => row.id))
        cursor = rows[rows.length - 1]
      }

      expect(seen).toEqual([created.b1, created.a3, created.a2, created.a1])
      expect(new Set(seen).size).toBe(seen.length)
    })

    it('includes drafts only when asked', async () => {
      const rows = await ledgerPage({ p_limit: 50, p_include_drafts: true })
      expect(rows.map((row) => row.id)).toContain(created.b2)
    })

    it('filters by bucket', async () => {
      const rows = await ledgerPage({ p_limit: 50, p_buckets: ['car_project'] })
      expect(rows.map((row) => row.id)).toEqual([created.a3])
      // The subtotal follows the filter: day A is one row of 24m under it.
      expect(rows[0]!.day_total).toBe(24_000_000)
      expect(rows[0]!.day_count).toBe(1)
    })

    it('filters by category and by vehicle', async () => {
      const byCategory = await ledgerPage({ p_limit: 50, p_category_ids: [fuelId] })
      expect(byCategory.map((row) => row.id).sort()).toEqual([created.a2, created.b1].sort())

      const byVehicle = await ledgerPage({ p_limit: 50, p_vehicle_ids: [vehicleId] })
      expect(byVehicle).toHaveLength(3)
      expect(byVehicle.every((row) => row.vehicle_nickname === 'Ledger probe')).toBe(true)
    })

    it('filters by date range', async () => {
      const rows = await ledgerPage({ p_limit: 50, p_from: DAY_B, p_to: DAY_B })
      expect(rows.map((row) => row.id)).toEqual([created.b1])
    })

    it('filters by amount range', async () => {
      const rows = await ledgerPage({ p_limit: 50, p_amount_min: 200_000, p_amount_max: 1_000_000 })
      expect(rows.map((row) => row.id)).toEqual([created.a2])
    })

    it('filters by whether there is a photo', async () => {
      const withPhoto = await ledgerPage({ p_limit: 50, p_has_photo: true })
      expect(withPhoto.map((row) => row.id)).toEqual([created.a2])
      expect(withPhoto[0]!.attachment_count).toBe(1)

      const without = await ledgerPage({ p_limit: 50, p_has_photo: false })
      expect(without.map((row) => row.id)).not.toContain(created.a2)
      expect(without).toHaveLength(3)
    })

    it('searches across note and merchant, case-insensitively', async () => {
      const byNote = await ledgerPage({ p_limit: 50, p_search: 'COILOVER' })
      expect(byNote.map((row) => row.id)).toEqual([created.a3])

      const byMerchant = await ledgerPage({ p_limit: 50, p_search: 'petrol' })
      expect(byMerchant.map((row) => row.id)).toEqual([created.a2])
    })

    it('joins the category and vehicle names the ledger renders', async () => {
      const rows = await ledgerPage({ p_limit: 50, p_category_ids: [groceriesId] })
      expect(rows[0]!.category_name).toBe('Groceries')
      expect(rows[0]!.vehicle_nickname).toBeNull()
    })
  })

  describe('v_monthly_impact', () => {
    it('sums only budget-affecting, non-draft expenses, one slice per month', async () => {
      const months = (await rest(
        'v_monthly_impact?select=impact_month,total,expense_count&order=impact_month.asc',
      )) as { impact_month: string; total: number; expense_count: number }[]

      const firstMonth = DAY_A.slice(0, 7)
      const rowsInFirstMonth = months.filter((row) => row.impact_month.startsWith(firstMonth))
      const total = rowsInFirstMonth.reduce((sum, row) => sum + row.total, 0)

      // The 24m project spend is out of the budget entirely, the draft does not
      // count, and the 100 spread over three months contributes 34 in its first
      // month -- unless day A and day B fall in different months, in which case
      // only day A's two hundred and fifty thousand plus a hundred thousand land.
      const sameMonth = DAY_A.slice(0, 7) === DAY_B.slice(0, 7)
      expect(total).toBe(sameMonth ? 350_034 : 350_000)
    })

    it('spreads the remainder onto the first slice', async () => {
      const impact = (await rest(
        `v_expense_impact?select=impact_month,amount&expense_id=eq.${created.b1}&order=impact_month.asc`,
      )) as { amount: number }[]
      expect(impact.map((row) => row.amount)).toEqual([34, 33, 33])
    })
  })

  describe('v_categories_ranked', () => {
    it('puts recently used categories ahead of unused ones', async () => {
      const ranked = (await rest(
        'v_categories_ranked?select=name,uses_recent,uses_all&archived_at=is.null' +
          '&order=uses_recent.desc,uses_all.desc,sort_order.asc',
      )) as { name: string; uses_recent: number; uses_all: number }[]

      expect(ranked[0]?.name).toBe('Fuel')
      expect(ranked[0]?.uses_recent).toBe(2)
      // Everything unused sits behind everything used.
      const firstUnused = ranked.findIndex((row) => row.uses_all === 0)
      const lastUsed = ranked.map((row) => row.uses_all).lastIndexOf(1)
      expect(firstUnused).toBeGreaterThan(lastUsed)
    })
  })

  describe('v_amortise_suggestion', () => {
    it('is the median of the last ninety days times the profile multiplier', async () => {
      const rows = (await rest('v_amortise_suggestion?select=median_amount,multiplier,threshold')) as {
        median_amount: number
        multiplier: string
        threshold: number
      }[]
      const suggestion = rows[0]!

      // The draft is excluded, leaving magnitudes 100, 100000, 250000 and
      // 24000000. An even count interpolates: (100000 + 250000) / 2.
      expect(suggestion.median_amount).toBe(175_000)
      expect(Number(suggestion.multiplier)).toBe(3)
      expect(suggestion.threshold).toBe(525_000)
    })
  })
})
