/**
 * The seam between the browser's plan and the server's gate.
 *
 * The planner builds expenses; the action parses them with `expenseWriteSchema`,
 * the same schema the quick-add sheet and the ledger's edit form go through. If
 * those two ever disagree about the shape of an expense, the import screen shows
 * a confident summary and the commit fails on the last tap — the worst place to
 * find out. This test is what stops that drifting apart silently.
 */

import { describe, expect, it } from 'vitest'

import { parseCsv } from '@/lib/csv/parse'
import { autoMap } from '@/lib/import/fields'
import { planImport, readyExpenses } from '@/lib/import/rows'
import { importCommitSchema } from '@/lib/import/schema'
import type { ImportContext } from '@/lib/import/types'

const CONTEXT: ImportContext = {
  categories: [
    { id: '11111111-1111-4111-8111-111111111111', name: 'Fuel', default_bucket: 'car_running', default_counts_toward_budget: true },
  ],
  vehicles: [{ id: '22222222-2222-4222-8222-222222222222', nickname: 'The Civic' }],
  currency: 'VND',
}

const CSV = [
  'occurred_on,amount,category,vehicle,bucket,counts_toward_budget,amortize_months,merchant,note,odometer_km',
  '2026-08-26,640.000,Fuel,The Civic,car_running,yes,1,"Petrolimex, Nguyễn Trãi",Đổ đầy bình,41000',
  '2026-08-27,4.200.000,Coilovers,The Civic,car_project,no,6,,,',
  '2026-08-28,-1.500.000,Coilovers,The Civic,car_project,no,1,Sold the springs,,',
  '2026-08-29,85.000,,,life,yes,1,Bún chả,,',
].join('\n')

describe('importCommitSchema', () => {
  it('accepts everything the planner produces', () => {
    const table = parseCsv(CSV)
    const plan = planImport(table, autoMap(table.header), CONTEXT)

    expect(plan.ready).toBe(4)

    const parsed = importCommitSchema.safeParse({
      categories: plan.newCategories,
      expenses: readyExpenses(plan),
    })

    expect(parsed.success).toBe(true)
    if (!parsed.success) return

    expect(parsed.data.expenses).toHaveLength(4)
    // The refund keeps its sign, and the spread keeps its months.
    expect(parsed.data.expenses[2]?.amount).toBe(-1_500_000)
    expect(parsed.data.expenses[1]?.amortize_months).toBe(6)
    // The category the file invented arrives with it.
    expect(parsed.data.categories).toHaveLength(1)
    expect(parsed.data.categories[0]?.name).toBe('Coilovers')
  })

  it('refuses a car bucket with no car, whatever the client claims', () => {
    const parsed = importCommitSchema.safeParse({
      categories: [],
      expenses: [
        {
          id: '33333333-3333-4333-8333-333333333333',
          occurred_on: '2026-08-26',
          amount: 150_000,
          currency: 'VND',
          category_id: null,
          vehicle_id: null,
          bucket: 'car_running',
          counts_toward_budget: true,
          amortize_months: 1,
          merchant: null,
          note: null,
          odometer_km: null,
        },
      ],
    })

    expect(parsed.success).toBe(false)
  })

  it('refuses an empty import rather than calling the function for nothing', () => {
    expect(importCommitSchema.safeParse({ categories: [], expenses: [] }).success).toBe(false)
  })
})
