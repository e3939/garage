/**
 * Budgets, funds and reports against the local stack.
 *
 * The phase's acceptance criterion is a sentence about arithmetic — "a month
 * containing one big purchase shows a sane monthly number and an honest all-in
 * number" — so the fixture is exactly that month, and the first block of this
 * file is that sentence written as assertions.
 *
 * The rule the whole phase rests on: **a budget figure reads
 * `v_expense_impact`.** A set of tyres bought outright and spread over two years
 * must move the budget by one twenty-fourth this month, not by all of it, or the
 * arc on `/money` is telling a lie every time somebody buys something big. That
 * is asserted here rather than assumed, because it is the one bug in this phase
 * that would look completely normal on screen.
 *
 * `lib/funds/projection.ts` is checked against `v_fund_status` the same way
 * `lib/recurring/cadence.ts` is checked against `next_recurrence_due`: the view
 * is the implementation, the module is the copy the form uses before anything is
 * saved, and if they disagree the module is the bug.
 *
 * Skipped unless GARAGE_DB_TESTS is set, so `npm test` stays hermetic.
 * Run with `npm run test:db`.
 */

import { beforeAll, describe, expect, it } from 'vitest'

import { DB_TESTS_ENABLED, readStack, type Stack } from '@/lib/supabase/test-stack'

import { projectFund } from '@/lib/funds/projection'
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

/** The calendar day the database thinks it is, in the app's timezone. */
function appToday(): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Ho_Chi_Minh',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date())
}

// ---------------------------------------------------------------------------
// The fixture: May 2026, with one big purchase in it.
//
//   Rent          8.000.000  life,        counts, one month
//   Tyres        24.000.000  car running, counts, spread over 24 months
//   Fuel          1.500.000  car running, counts, one month
//   Track day     3.000.000  car project, does NOT count toward the budget
//
// So the month has four honest numbers and they are all different:
//
//   monthly (budget) 10.500.000   8.000.000 + 1.000.000 + 1.500.000
//   all-in           36.500.000   everything, on the day it was paid
//   car only        (28.500.000)  the two car buckets, all-in
//
// The track day is the case that separates "counts toward the budget" from
// "happened": it is real money and belongs in the all-in figure, but it was
// deliberately excluded from the budget, so it must not move the arc.
// ---------------------------------------------------------------------------

const MONTH = '2026-05-01'
const NEXT_MONTH = '2026-06-01'

const RENT = 8_000_000
const TYRES = 24_000_000
const TYRE_MONTHS = 24
const TYRE_SLICE = TYRES / TYRE_MONTHS // 1.000.000
const FUEL = 1_500_000
const TRACK_DAY = 3_000_000

const MONTHLY_TOTAL = RENT + TYRE_SLICE + FUEL // 10.500.000
const ALL_IN_TOTAL = RENT + TYRES + FUEL + TRACK_DAY // 36.500.000
const CAR_ONLY_TOTAL = TYRES + FUEL + TRACK_DAY // 28.500.000

const BUDGET = 12_000_000

let vehicleId: string
let lifeCategoryId: string
let carCategoryId: string

type MonthTotals = {
  month: string
  monthly_total: number
  monthly_count: number
  all_in_total: number
  all_in_count: number
  car_only_total: number
  car_only_count: number
}

type BudgetMonth = {
  month: string
  budget_amount: number | null
  spent: number
  expense_count: number
  remaining: number | null
  used_fraction: number | null
}

type FundStatusRow = {
  fund_id: string
  balance: number
  remaining: number
  progress: number | null
  months_remaining: number | null
  projected_on: string | null
  contribution_count: number
}

describe.skipIf(!DB_TESTS_ENABLED)('Phase 7 budgets, funds and reports', () => {
  beforeAll(async () => {
    stack = readStack()
    user = await createUser('money')
    stranger = await createUser('money-stranger')

    const categories = (await rest(
      'categories?select=id,name,default_bucket&order=sort_order.asc',
    )) as { id: string; name: string; default_bucket: string }[]
    lifeCategoryId = categories.find((row) => row.default_bucket === 'life')!.id
    carCategoryId = categories.find((row) => row.default_bucket === 'car_running')!.id

    const vehicles = (await rest('vehicles', {
      method: 'POST',
      body: JSON.stringify([
        { user_id: user.id, nickname: 'Money probe', odometer_km: 20_000, sort_order: 0 },
      ]),
    })) as { id: string }[]
    vehicleId = vehicles[0]!.id

    await rest('expenses', {
      method: 'POST',
      body: JSON.stringify([
        {
          user_id: user.id,
          occurred_on: '2026-05-01',
          amount: RENT,
          currency: 'VND',
          category_id: lifeCategoryId,
          // Stated rather than omitted: PostgREST rejects a bulk insert whose
          // rows do not all carry the same keys.
          vehicle_id: null,
          bucket: 'life',
          counts_toward_budget: true,
          amortize_months: 1,
          merchant: 'Rent',
        },
        {
          user_id: user.id,
          occurred_on: '2026-05-10',
          amount: TYRES,
          currency: 'VND',
          category_id: carCategoryId,
          vehicle_id: vehicleId,
          bucket: 'car_running',
          counts_toward_budget: true,
          amortize_months: TYRE_MONTHS,
          merchant: 'Tyres',
        },
        {
          user_id: user.id,
          occurred_on: '2026-05-14',
          amount: FUEL,
          currency: 'VND',
          category_id: carCategoryId,
          vehicle_id: vehicleId,
          bucket: 'car_running',
          counts_toward_budget: true,
          amortize_months: 1,
          merchant: 'Fuel',
        },
        {
          user_id: user.id,
          occurred_on: '2026-05-20',
          amount: TRACK_DAY,
          currency: 'VND',
          category_id: carCategoryId,
          vehicle_id: vehicleId,
          bucket: 'car_project',
          counts_toward_budget: false,
          amortize_months: 1,
          merchant: 'Track day',
        },
      ]),
    })
  })

  // -------------------------------------------------------------------------
  // The acceptance criterion.
  // -------------------------------------------------------------------------

  describe('a month with one big purchase in it', () => {
    it('has a sane monthly number and an honest all-in number', async () => {
      const rows = (await rest(
        `v_month_totals?month=eq.${MONTH}&currency=eq.VND&select=*`,
      )) as MonthTotals[]

      expect(rows).toHaveLength(1)
      expect(rows[0]).toMatchObject({
        monthly_total: MONTHLY_TOTAL, // 10.500.000 — the tyres count once
        all_in_total: ALL_IN_TOTAL, // 36.500.000 — the tyres count in full
        car_only_total: CAR_ONLY_TOTAL,
      })

      // Not the same number, and that is the entire point of the app.
      expect(rows[0]!.monthly_total).toBeLessThan(rows[0]!.all_in_total)
    })

    it('counts the budget-excluded expense in all-in and nowhere else', async () => {
      const rows = (await rest(
        `v_month_totals?month=eq.${MONTH}&currency=eq.VND&select=*`,
      )) as MonthTotals[]

      // Three expenses affect the budget; four happened.
      expect(rows[0]!.monthly_count).toBe(3)
      expect(rows[0]!.all_in_count).toBe(4)
    })

    it('carries the rest of the big purchase into the months ahead', async () => {
      const rows = (await rest(
        `v_month_totals?month=eq.${NEXT_MONTH}&currency=eq.VND&select=*`,
      )) as MonthTotals[]

      expect(rows[0]).toMatchObject({
        monthly_total: TYRE_SLICE,
        monthly_count: 1,
        all_in_total: 0,
        all_in_count: 0,
      })
    })

    it('spreads a remainder onto the first slice rather than losing it', async () => {
      // 100 over 3 months is 34/33/33. A split that rounded would quietly
      // destroy a dong, and money that does not add up is the one thing a
      // ledger may never do.
      const created = (await rest('expenses', {
        method: 'POST',
        body: JSON.stringify([
          {
            user_id: user.id,
            occurred_on: '2026-09-01',
            amount: 100,
            currency: 'VND',
            category_id: lifeCategoryId,
            bucket: 'life',
            counts_toward_budget: true,
            amortize_months: 3,
            merchant: 'Remainder probe',
          },
        ]),
      })) as { id: string }[]

      // Filtered to this expense, not to the months it lands in: the tyres are
      // still being spread across that part of the calendar.
      const slices = (await rest(
        `v_expense_impact?expense_id=eq.${created[0]!.id}&select=impact_month,amount&order=impact_month.asc`,
      )) as { impact_month: string; amount: number }[]

      expect(slices.map((row) => row.amount)).toEqual([34, 33, 33])
      expect(slices.reduce((sum, row) => sum + row.amount, 0)).toBe(100)
    })
  })

  // -------------------------------------------------------------------------
  // Budgets.
  // -------------------------------------------------------------------------

  describe('the budget arc reads the amortised figure', () => {
    beforeAll(async () => {
      await rest('budgets', {
        method: 'POST',
        body: JSON.stringify([
          { user_id: user.id, month: MONTH, category_id: null, amount: BUDGET, currency: 'VND' },
        ]),
      })
    })

    it('measures the month against the monthly total, not the cash total', async () => {
      const rows = (await rest(
        `v_budget_month?month=eq.${MONTH}&currency=eq.VND&select=*`,
      )) as BudgetMonth[]

      expect(rows).toHaveLength(1)
      expect(rows[0]).toMatchObject({
        budget_amount: BUDGET,
        spent: MONTHLY_TOTAL,
        remaining: BUDGET - MONTHLY_TOTAL,
      })

      // 10.500.000 of 12.000.000 is 87.5% — under the redline. Read against the
      // all-in figure it would be 304%, and the arc would be screaming about a
      // month that is actually fine.
      expect(Number(rows[0]!.used_fraction)).toBeCloseTo(0.875, 4)
    })

    it('shows a month with spend and no budget set', async () => {
      const rows = (await rest(
        `v_budget_month?month=eq.${NEXT_MONTH}&currency=eq.VND&select=*`,
      )) as BudgetMonth[]

      expect(rows).toHaveLength(1)
      expect(rows[0]).toMatchObject({
        budget_amount: null,
        spent: TYRE_SLICE,
        remaining: null,
        used_fraction: null,
      })
    })

    it('caps a category against spend in that category only', async () => {
      await rest('budgets', {
        method: 'POST',
        body: JSON.stringify([
          {
            user_id: user.id,
            month: MONTH,
            category_id: carCategoryId,
            amount: 3_000_000,
            currency: 'VND',
          },
        ]),
      })

      const rows = (await rest(
        `v_budget_category_month?month=eq.${MONTH}&category_id=eq.${carCategoryId}&select=*`,
      )) as (BudgetMonth & { category_id: string })[]

      expect(rows).toHaveLength(1)
      // The tyre slice and the fuel. Not the track day, which does not count.
      expect(rows[0]).toMatchObject({
        budget_amount: 3_000_000,
        spent: TYRE_SLICE + FUEL,
        remaining: 500_000,
      })
    })

    it('gives a category with no cap no row at all', async () => {
      const rows = (await rest(
        `v_budget_category_month?month=eq.${MONTH}&category_id=eq.${lifeCategoryId}&select=budget_id`,
      )) as unknown[]
      expect(rows).toEqual([])
    })

    it('copies last month forward without overwriting anything already there', async () => {
      const target = '2026-07-01'

      // A figure already typed for July, which the copy must leave alone.
      await rest('budgets', {
        method: 'POST',
        body: JSON.stringify([
          { user_id: user.id, month: target, category_id: null, amount: 99_000_000, currency: 'VND' },
        ]),
      })

      const copied = (await rest('rpc/copy_budgets_from', {
        method: 'POST',
        body: JSON.stringify({ p_from: MONTH, p_to: target }),
      })) as number

      // The overall figure was already there; only the category cap was copied.
      expect(copied).toBe(1)

      const rows = (await rest(
        `budgets?month=eq.${target}&select=category_id,amount&order=category_id.asc.nullsfirst`,
      )) as { category_id: string | null; amount: number }[]

      expect(rows).toHaveLength(2)
      expect(rows.find((row) => row.category_id === null)!.amount).toBe(99_000_000)
      expect(rows.find((row) => row.category_id === carCategoryId)!.amount).toBe(3_000_000)
    })
  })

  // -------------------------------------------------------------------------
  // Funds.
  // -------------------------------------------------------------------------

  describe('funds', () => {
    let fundId: string

    beforeAll(async () => {
      const funds = (await rest('funds', {
        method: 'POST',
        body: JSON.stringify([
          {
            user_id: user.id,
            name: 'Coilovers',
            vehicle_id: vehicleId,
            target_amount: 20_000_000,
            monthly_contribution: 2_000_000,
            currency: 'VND',
          },
        ]),
      })) as { id: string }[]
      fundId = funds[0]!.id

      await rest('fund_contributions', {
        method: 'POST',
        body: JSON.stringify([
          { user_id: user.id, fund_id: fundId, occurred_on: '2026-04-01', amount: 3_000_000 },
          { user_id: user.id, fund_id: fundId, occurred_on: '2026-05-01', amount: 2_000_000 },
        ]),
      })
    })

    async function status(): Promise<FundStatusRow> {
      const rows = (await rest(`v_fund_status?fund_id=eq.${fundId}&select=*`)) as FundStatusRow[]
      return rows[0]!
    }

    it('sums the contributions rather than storing a balance', async () => {
      const row = await status()
      expect(row.balance).toBe(5_000_000)
      expect(row.contribution_count).toBe(2)
      expect(row.remaining).toBe(15_000_000)
      expect(Number(row.progress)).toBeCloseTo(0.25, 4)
    })

    it('projects the same completion month as lib/funds/projection.ts', async () => {
      const row = await status()

      const fromModule = projectFund({
        target: 20_000_000,
        balance: row.balance,
        monthlyContribution: 2_000_000,
        from: appToday() as IsoDate,
      })

      expect(row.months_remaining).toBe(fromModule.monthsRemaining)
      expect(row.projected_on).toBe(fromModule.projectedOn)
    })

    it('takes a drawdown as a negative contribution', async () => {
      await rest('fund_contributions', {
        method: 'POST',
        body: JSON.stringify([
          {
            user_id: user.id,
            fund_id: fundId,
            occurred_on: '2026-05-20',
            amount: -1_500_000,
            note: 'Coilovers',
          },
        ]),
      })

      const row = await status()
      expect(row.balance).toBe(3_500_000)
      expect(row.remaining).toBe(16_500_000)

      const fromModule = projectFund({
        target: 20_000_000,
        balance: row.balance,
        monthlyContribution: 2_000_000,
        from: appToday() as IsoDate,
      })
      expect(row.months_remaining).toBe(fromModule.monthsRemaining)
      expect(row.projected_on).toBe(fromModule.projectedOn)
    })

    it('names no date when there is no contribution rate', async () => {
      const funds = (await rest('funds', {
        method: 'POST',
        body: JSON.stringify([
          {
            user_id: user.id,
            name: 'Someday',
            target_amount: 50_000_000,
            monthly_contribution: null,
            currency: 'VND',
          },
        ]),
      })) as { id: string }[]

      const rows = (await rest(
        `v_fund_status?fund_id=eq.${funds[0]!.id}&select=*`,
      )) as FundStatusRow[]

      expect(rows[0]!.months_remaining).toBeNull()
      expect(rows[0]!.projected_on).toBeNull()
    })
  })

  // -------------------------------------------------------------------------
  // Reports.
  // -------------------------------------------------------------------------

  describe('reports', () => {
    it('returns both views side by side, and keeps empty months on the axis', async () => {
      const rows = (await rest('rpc/report_months', {
        method: 'POST',
        body: JSON.stringify({ p_from: '2026-03-01', p_to: NEXT_MONTH, p_currency: 'VND' }),
      })) as MonthTotals[]

      expect(rows.map((row) => row.month)).toEqual([
        '2026-03-01',
        '2026-04-01',
        MONTH,
        NEXT_MONTH,
      ])

      // March and April are empty and still on the axis: a month with nothing
      // in it is a fact about the year, not a row to leave out.
      expect(rows[0]).toMatchObject({ monthly_total: 0, all_in_total: 0 })
      expect(rows[2]).toMatchObject({
        monthly_total: MONTHLY_TOTAL,
        all_in_total: ALL_IN_TOTAL,
      })
      expect(rows[3]).toMatchObject({ monthly_total: TYRE_SLICE, all_in_total: 0 })
    })

    it('splits life from car with both figures', async () => {
      const rows = (await rest('rpc/report_buckets', {
        method: 'POST',
        body: JSON.stringify({ p_from: MONTH, p_to: MONTH, p_currency: 'VND' }),
      })) as { bucket: string; monthly_total: number; all_in_total: number }[]

      const byBucket = Object.fromEntries(rows.map((row) => [row.bucket, row]))

      expect(byBucket.life).toMatchObject({ monthly_total: RENT, all_in_total: RENT })
      expect(byBucket.car_running).toMatchObject({
        monthly_total: TYRE_SLICE + FUEL,
        all_in_total: TYRES + FUEL,
      })
      // Excluded from the budget, so it has an all-in figure and no monthly one.
      expect(byBucket.car_project).toMatchObject({
        monthly_total: 0,
        all_in_total: TRACK_DAY,
      })
    })

    it('breaks the month down by category', async () => {
      const rows = (await rest('rpc/report_categories', {
        method: 'POST',
        body: JSON.stringify({ p_from: MONTH, p_to: MONTH, p_currency: 'VND' }),
      })) as { category_id: string; monthly_total: number; all_in_total: number }[]

      const car = rows.find((row) => row.category_id === carCategoryId)!
      expect(car).toMatchObject({
        monthly_total: TYRE_SLICE + FUEL,
        all_in_total: TYRES + FUEL + TRACK_DAY,
      })
    })

    it('lists the largest expenses at what was actually paid', async () => {
      const rows = (await rest('rpc/report_top_expenses', {
        method: 'POST',
        body: JSON.stringify({
          p_from: MONTH,
          p_to: MONTH,
          p_currency: 'VND',
          p_limit: 10,
        }),
      })) as { merchant: string; amount: number; amortize_months: number }[]

      expect(rows.map((row) => row.merchant)).toEqual(['Tyres', 'Rent', 'Track day', 'Fuel'])
      // The tyres appear at 24.000.000, not at the monthly slice: this list
      // answers "what were the big ones", which is a question about cash.
      expect(rows[0]).toMatchObject({ amount: TYRES, amortize_months: TYRE_MONTHS })
    })

    it('honours the limit', async () => {
      const rows = (await rest('rpc/report_top_expenses', {
        method: 'POST',
        body: JSON.stringify({ p_from: MONTH, p_to: MONTH, p_currency: 'VND', p_limit: 2 }),
      })) as unknown[]
      expect(rows).toHaveLength(2)
    })
  })

  // -------------------------------------------------------------------------

  describe('none of it belongs to anybody else', () => {
    it('shows a stranger no budgets, no funds and no totals', async () => {
      for (const view of ['v_budget_month', 'v_budget_category_month', 'v_fund_status']) {
        const response = await call(stranger, `${view}?select=*`)
        expect(await response.json()).toEqual([])
      }
    })

    it('returns a stranger empty reports over the same range', async () => {
      for (const fn of ['report_months', 'report_categories', 'report_buckets']) {
        const response = await call(stranger, `rpc/${fn}`, {
          method: 'POST',
          body: JSON.stringify({ p_from: MONTH, p_to: MONTH, p_currency: 'VND' }),
        })
        const rows = await response.json()

        // Asserted rather than assumed: a function that errors returns an
        // object, and `[].every()` on one of those would pass by accident.
        expect(response.ok, `${fn}: ${JSON.stringify(rows)}`).toBe(true)
        expect(Array.isArray(rows)).toBe(true)

        // report_months keeps its month rows; every figure in them is zero.
        expect(
          (rows as { all_in_total?: number }[]).every((row) => (row.all_in_total ?? 0) === 0),
        ).toBe(true)
      }

      const top = await call(stranger, 'rpc/report_top_expenses', {
        method: 'POST',
        body: JSON.stringify({ p_from: MONTH, p_to: MONTH, p_currency: 'VND', p_limit: 10 }),
      })
      expect(await top.json()).toEqual([])
    })

    it('refuses a stranger a contribution to another persons fund', async () => {
      const funds = (await rest('funds?select=id&limit=1')) as { id: string }[]
      const response = await call(stranger, 'fund_contributions', {
        method: 'POST',
        body: JSON.stringify([
          {
            user_id: user.id,
            fund_id: funds[0]!.id,
            occurred_on: '2026-05-01',
            amount: 1_000_000,
          },
        ]),
      })
      expect(response.ok).toBe(false)
    })
  })
})
