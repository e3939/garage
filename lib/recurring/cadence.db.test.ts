/**
 * The recurrence machinery, against the local stack.
 *
 * Two things are proved here, and they are the two the phase's copy promises out
 * loud:
 *
 *   1. **`lib/recurring/cadence.ts` and `next_recurrence_due` agree.** The
 *      module exists so the template form can say "next due 1 October" before
 *      anything is saved, and the database is what the cron job actually runs.
 *      Both are walked over the same set of dates — the awkward ones — and any
 *      disagreement fails here. Migration 0017 says "if the two disagree, this
 *      one is right"; this is the test that makes that sentence checkable.
 *   2. **A draft enters nothing.** `generate_due_recurrences` writes rows, and
 *      those rows must be invisible to every total in the app until a person
 *      confirms them. docs/01-PRODUCT.md: "Never silently created."
 *
 * Skipped unless GARAGE_DB_TESTS is set, so `npm test` stays hermetic.
 * Run with `npm run test:db`.
 */

import { beforeAll, describe, expect, it } from 'vitest'

import { DB_TESTS_ENABLED, readStack, type Stack } from '@/lib/supabase/test-stack'

import { firstDueOnOrAfter, nextDueAfter, type Cadence } from '@/lib/recurring/cadence'
import type { IsoDate } from '@/lib/dates'


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

/**
 * The cron job's own credentials. `generate_due_recurrences` is security
 * definer and granted to `service_role` alone, so this is the only way to run
 * it — which is itself one of the things worth asserting.
 */
async function asService(path: string, init: RequestInit = {}): Promise<Response> {
  return fetch(`${stack.apiUrl}/rest/v1/${path}`, {
    ...init,
    headers: {
      apikey: stack.secretKey,
      authorization: `Bearer ${stack.secretKey}`,
      'content-type': 'application/json',
      prefer: 'return=representation',
      ...(init.headers ?? {}),
    },
  })
}

// ---------------------------------------------------------------------------
// 1. The two implementations of the same arithmetic.
// ---------------------------------------------------------------------------

type CadenceCase = {
  cadence: Cadence
  from: string
  dayOfMonth?: number | null
  monthOfYear?: number | null
}

/**
 * The awkward dates. Every one of these is a month boundary, a short month, a
 * leap year, or a year rollover — the plain middle-of-the-month cases are in
 * `lib/recurring/cadence.test.ts` and cannot drift between two implementations
 * in an interesting way.
 */
const CASES: CadenceCase[] = [
  { cadence: 'monthly', from: '2026-01-31', dayOfMonth: 31 },
  { cadence: 'monthly', from: '2026-02-28', dayOfMonth: 31 },
  { cadence: 'monthly', from: '2026-03-31', dayOfMonth: 31 },
  { cadence: 'monthly', from: '2026-04-30', dayOfMonth: 31 },
  { cadence: 'monthly', from: '2026-01-30', dayOfMonth: 30 },
  { cadence: 'monthly', from: '2026-01-29', dayOfMonth: 29 },
  { cadence: 'monthly', from: '2024-01-31', dayOfMonth: 31 },
  { cadence: 'monthly', from: '2024-02-29', dayOfMonth: 29 },
  { cadence: 'monthly', from: '2026-12-31', dayOfMonth: 31 },
  { cadence: 'monthly', from: '2026-12-01', dayOfMonth: 1 },
  { cadence: 'monthly', from: '2026-01-31' },
  { cadence: 'monthly', from: '2026-08-15' },
  { cadence: 'quarterly', from: '2026-01-31', dayOfMonth: 31 },
  { cadence: 'quarterly', from: '2026-11-30', dayOfMonth: 30 },
  { cadence: 'quarterly', from: '2026-08-31', dayOfMonth: 31 },
  { cadence: 'quarterly', from: '2026-10-15' },
  { cadence: 'yearly', from: '2024-02-29', dayOfMonth: 29, monthOfYear: 2 },
  { cadence: 'yearly', from: '2025-02-28', dayOfMonth: 29, monthOfYear: 2 },
  { cadence: 'yearly', from: '2027-02-28', dayOfMonth: 29, monthOfYear: 2 },
  { cadence: 'yearly', from: '2026-03-15', dayOfMonth: 15, monthOfYear: 3 },
  { cadence: 'yearly', from: '2026-12-31', dayOfMonth: 31, monthOfYear: 12 },
  { cadence: 'yearly', from: '2026-06-10' },
]

async function sqlNextDue(input: CadenceCase): Promise<string> {
  const response = await call(user, 'rpc/next_recurrence_due', {
    method: 'POST',
    body: JSON.stringify({
      p_cadence: input.cadence,
      p_from: input.from,
      p_day_of_month: input.dayOfMonth ?? null,
      p_month_of_year: input.monthOfYear ?? null,
    }),
  })
  const text = await response.text()
  if (!response.ok) throw new Error(`next_recurrence_due failed: ${response.status} ${text}`)
  // A scalar-returning function comes back as a bare JSON string.
  return JSON.parse(text) as string
}

// ---------------------------------------------------------------------------
// 2. Generation.
// ---------------------------------------------------------------------------

type GeneratedRow = {
  expense_id: string
  recurring_id: string
  user_id: string
  occurred_on: string
  amount: number
}

async function generate(today: string): Promise<GeneratedRow[]> {
  const response = await asService('rpc/generate_due_recurrences', {
    method: 'POST',
    body: JSON.stringify({ p_today: today }),
  })
  const text = await response.text()
  if (!response.ok) throw new Error(`generate failed: ${response.status} ${text}`)
  const rows = JSON.parse(text) as GeneratedRow[]
  // Every run in this file is scoped to the probe user; another suite's rows
  // running concurrently are not this test's business.
  return rows.filter((row) => row.user_id === user.id)
}

async function templateRow(id: string): Promise<{ next_due: string; active: boolean }> {
  const rows = (await rest(`recurring_expenses?id=eq.${id}&select=next_due,active`)) as {
    next_due: string
    active: boolean
  }[]
  return rows[0]!
}

let categoryId: string
let vehicleId: string

describe.skipIf(!DB_TESTS_ENABLED)('Phase 7 recurrences', () => {
  beforeAll(async () => {
    stack = readStack()
    user = await createUser('recurring')
    stranger = await createUser('recurring-stranger')

    const categories = (await rest('categories?select=id&limit=1')) as { id: string }[]
    categoryId = categories[0]!.id

    const vehicles = (await rest('vehicles', {
      method: 'POST',
      body: JSON.stringify([
        { user_id: user.id, nickname: 'Recurring probe', odometer_km: 10_000, sort_order: 0 },
      ]),
    })) as { id: string }[]
    vehicleId = vehicles[0]!.id
  })

  // -------------------------------------------------------------------------

  describe('the module and the function agree', () => {
    it('lands on the same date for every awkward case', async () => {
      const mismatches: string[] = []

      for (const input of CASES) {
        const fromDatabase = await sqlNextDue(input)
        const fromModule = nextDueAfter({
          cadence: input.cadence,
          from: input.from as IsoDate,
          dayOfMonth: input.dayOfMonth ?? null,
          monthOfYear: input.monthOfYear ?? null,
        })

        if (fromDatabase !== fromModule) {
          mismatches.push(
            `${input.cadence} from ${input.from} (day ${input.dayOfMonth ?? '-'}, month ${
              input.monthOfYear ?? '-'
            }): database ${fromDatabase}, module ${fromModule}`,
          )
        }
      }

      expect(mismatches).toEqual([])
    })

    it('still agrees after twelve periods of compounding', async () => {
      // One step agreeing is weaker than it looks: the interesting failure is a
      // day that drifts one place per period and only shows up months later.
      let fromDatabase = '2026-01-31'
      let fromModule: string = '2026-01-31'

      for (let step = 0; step < 12; step += 1) {
        fromDatabase = await sqlNextDue({
          cadence: 'monthly',
          from: fromDatabase,
          dayOfMonth: 31,
        })
        fromModule = nextDueAfter({
          cadence: 'monthly',
          from: fromModule as IsoDate,
          dayOfMonth: 31,
        })
      }

      expect(fromDatabase).toBe(fromModule)
      expect(fromDatabase).toBe('2027-01-31')
    })
  })

  // -------------------------------------------------------------------------

  describe('generating drafts', () => {
    let dueTemplateId: string

    it('writes one draft for a template that has come due and moves it on', async () => {
      const created = (await rest('recurring_expenses', {
        method: 'POST',
        body: JSON.stringify([
          {
            user_id: user.id,
            label: 'Rent',
            amount: 8_000_000,
            currency: 'VND',
            category_id: categoryId,
            cadence: 'monthly',
            day_of_month: 1,
            next_due: '2026-05-01',
            active: true,
          },
        ]),
      })) as { id: string }[]
      dueTemplateId = created[0]!.id

      const generated = await generate('2026-05-01')
      const mine = generated.filter((row) => row.recurring_id === dueTemplateId)

      expect(mine).toHaveLength(1)
      expect(mine[0]!.occurred_on).toBe('2026-05-01')
      expect(mine[0]!.amount).toBe(8_000_000)
      expect(await templateRow(dueTemplateId)).toMatchObject({ next_due: '2026-06-01' })
    })

    it('writes it as a draft, with the label as the merchant', async () => {
      const rows = (await rest(
        `expenses?recurring_id=eq.${dueTemplateId}&select=is_draft,merchant,bucket,amount,currency`,
      )) as { is_draft: boolean; merchant: string; bucket: string; amount: number }[]

      expect(rows).toHaveLength(1)
      expect(rows[0]).toMatchObject({
        is_draft: true,
        merchant: 'Rent',
        bucket: 'life',
        amount: 8_000_000,
      })
    })

    /**
     * The whole point. A draft that reached a total would be an expense the app
     * invented on somebody's behalf.
     */
    it('keeps the draft out of every total until it is confirmed', async () => {
      const impact = (await rest(
        `v_expense_impact?impact_month=eq.2026-05-01&select=expense_id`,
      )) as unknown[]
      expect(impact).toEqual([])

      const totals = (await rest(`v_month_totals?month=eq.2026-05-01&select=month`)) as unknown[]
      expect(totals).toEqual([])

      const budget = (await rest(
        `v_budget_month?month=eq.2026-05-01&select=spent,expense_count`,
      )) as unknown[]
      expect(budget).toEqual([])

      // And it is in the one view that is allowed to see it.
      const tray = (await rest(
        `v_draft_expenses?recurring_id=eq.${dueTemplateId}&select=id,recurring_label`,
      )) as { recurring_label: string }[]
      expect(tray).toHaveLength(1)
      expect(tray[0]!.recurring_label).toBe('Rent')
    })

    it('counts once it is confirmed', async () => {
      const drafts = (await rest(
        `expenses?recurring_id=eq.${dueTemplateId}&select=id`,
      )) as { id: string }[]

      await rest(`expenses?id=eq.${drafts[0]!.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ is_draft: false }),
      })

      const impact = (await rest(
        `v_expense_impact?impact_month=eq.2026-05-01&select=amount`,
      )) as { amount: number }[]
      expect(impact).toHaveLength(1)
      expect(impact[0]!.amount).toBe(8_000_000)

      // And it has left the tray.
      const tray = (await rest(
        `v_draft_expenses?recurring_id=eq.${dueTemplateId}&select=id`,
      )) as unknown[]
      expect(tray).toEqual([])
    })

    it('catches a late template up in one run rather than one period a day', async () => {
      const created = (await rest('recurring_expenses', {
        method: 'POST',
        body: JSON.stringify([
          {
            user_id: user.id,
            label: 'Insurance',
            amount: 1_200_000,
            currency: 'VND',
            category_id: categoryId,
            vehicle_id: vehicleId,
            bucket: 'car_running',
            counts_toward_budget: true,
            cadence: 'monthly',
            day_of_month: 15,
            next_due: '2026-01-15',
            active: true,
          },
        ]),
      })) as { id: string }[]
      const id = created[0]!.id

      // Five months behind: January through May inclusive.
      const generated = (await generate('2026-05-20')).filter((row) => row.recurring_id === id)

      expect(generated.map((row) => row.occurred_on)).toEqual([
        '2026-01-15',
        '2026-02-15',
        '2026-03-15',
        '2026-04-15',
        '2026-05-15',
      ])
      expect(await templateRow(id)).toMatchObject({ next_due: '2026-06-15' })
    })

    it('caps the catch-up so a due date left in the past cannot flood the tray', async () => {
      const created = (await rest('recurring_expenses', {
        method: 'POST',
        body: JSON.stringify([
          {
            user_id: user.id,
            label: 'Ancient',
            amount: 50_000,
            currency: 'VND',
            category_id: categoryId,
            cadence: 'monthly',
            day_of_month: 1,
            next_due: '2000-01-01',
            active: true,
          },
        ]),
      })) as { id: string }[]
      const id = created[0]!.id

      const generated = (await generate('2026-05-20')).filter((row) => row.recurring_id === id)

      // max_catch_up in migration 0017. Two years of monthly, and then it stops
      // and leaves the due date where it got to rather than spinning.
      expect(generated).toHaveLength(24)
      expect(await templateRow(id)).toMatchObject({ next_due: '2002-01-01' })
    })

    it('generates nothing for a template that is not due, inactive, or has no amount', async () => {
      const created = (await rest('recurring_expenses', {
        method: 'POST',
        body: JSON.stringify([
          {
            user_id: user.id,
            label: 'Not due yet',
            amount: 100_000,
            cadence: 'monthly',
            next_due: '2026-09-01',
            active: true,
          },
          {
            user_id: user.id,
            label: 'Switched off',
            amount: 100_000,
            cadence: 'monthly',
            next_due: '2026-01-01',
            active: false,
          },
          {
            user_id: user.id,
            label: 'No amount',
            amount: null,
            cadence: 'monthly',
            next_due: '2026-01-01',
            active: true,
          },
        ]),
      })) as { id: string }[]
      const ids = created.map((row) => row.id)

      const generated = await generate('2026-05-20')
      expect(generated.filter((row) => ids.includes(row.recurring_id))).toEqual([])

      // The inactive and amount-less ones keep their stale due date rather than
      // being quietly moved on, so switching one back on does what it looks like.
      expect(await templateRow(ids[1]!)).toMatchObject({ next_due: '2026-01-01' })
      expect(await templateRow(ids[2]!)).toMatchObject({ next_due: '2026-01-01' })
    })

    it('is refused to a signed-in user, because it bypasses RLS', async () => {
      const response = await call(user, 'rpc/generate_due_recurrences', {
        method: 'POST',
        body: JSON.stringify({ p_today: '2026-05-20' }),
      })
      expect(response.ok).toBe(false)
    })
  })

  // -------------------------------------------------------------------------

  describe('a form can compute a first due date the database would accept', () => {
    it('agrees with the function once the first date has been walked to', async () => {
      const first = firstDueOnOrAfter({
        cadence: 'monthly',
        from: '2026-08-20' as IsoDate,
        dayOfMonth: 1,
      })
      expect(first).toBe('2026-09-01')

      // The date the form shows is the date the job would then move on from.
      expect(await sqlNextDue({ cadence: 'monthly', from: first, dayOfMonth: 1 })).toBe(
        nextDueAfter({ cadence: 'monthly', from: first as IsoDate, dayOfMonth: 1 }),
      )
    })
  })

  // -------------------------------------------------------------------------

  describe('none of it belongs to anybody else', () => {
    it('shows a stranger no templates and no drafts', async () => {
      for (const path of ['recurring_expenses?select=id', 'v_draft_expenses?select=id']) {
        const response = await call(stranger, path)
        expect(await response.json()).toEqual([])
      }
    })

    it('refuses a stranger a template stamped with another user id', async () => {
      const response = await call(stranger, 'recurring_expenses', {
        method: 'POST',
        body: JSON.stringify([
          { user_id: user.id, label: 'Theirs', amount: 1, cadence: 'monthly', next_due: '2026-01-01' },
        ]),
      })
      expect(response.ok).toBe(false)
    })
  })
})
