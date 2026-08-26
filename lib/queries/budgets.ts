import 'server-only'

import { addMonthsToMonthStart, monthStart, todayIso, type IsoDate } from '@/lib/dates'
import { DEFAULT_CURRENCY } from '@/lib/money'
import { createClient } from '@/lib/supabase/server'
import type { BudgetMonth, BudgetSnapshot, CategoryBudget } from '@/lib/budgets/types'

const OVERALL_COLUMNS =
  'month, currency, budget_id, budget_amount, spent, expense_count, remaining, used_fraction'

const CATEGORY_COLUMNS = [
  'budget_id',
  'month',
  'category_id',
  'category_name',
  'category_icon',
  'category_colour_hex',
  'category_bucket',
  'currency',
  'budget_amount',
  'spent',
  'expense_count',
  'remaining',
  'used_fraction',
].join(', ')

/**
 * Everything the budget screen shows for one month, in three parallel reads.
 *
 * Both figures come out of `v_budget_month` and `v_budget_category_month`, which
 * read `v_expense_impact` — the only implementation of amortisation in the
 * system. A budget screen that summed `expenses` instead would show a set of
 * tyres spread over two years as one ruined August, and the whole model would be
 * a lie. Nothing here adds anything up.
 */
export async function fetchBudgetSnapshot(
  month: IsoDate = monthStart(todayIso()),
  currency: string = DEFAULT_CURRENCY,
): Promise<BudgetSnapshot> {
  const supabase = await createClient()
  const previous = addMonthsToMonthStart(month, -1)

  const [overallResult, capsResult, previousResult] = await Promise.all([
    supabase
      .from('v_budget_month')
      .select(OVERALL_COLUMNS)
      .eq('month', month)
      .eq('currency', currency)
      .maybeSingle(),
    supabase
      .from('v_budget_category_month')
      .select(CATEGORY_COLUMNS)
      .eq('month', month)
      .eq('currency', currency)
      .order('used_fraction', { ascending: false, nullsFirst: false })
      .order('budget_amount', { ascending: false }),
    // Only whether there is something to copy, not what it is. The copy happens
    // in SQL; the screen only needs to know whether to offer the button.
    supabase.from('budgets').select('id').eq('month', previous).limit(1),
  ])

  if (overallResult.error) throw new Error(`v_budget_month failed: ${overallResult.error.message}`)
  if (capsResult.error) throw new Error(`v_budget_category_month failed: ${capsResult.error.message}`)
  if (previousResult.error) throw new Error(`budgets failed: ${previousResult.error.message}`)

  return {
    month,
    currency,
    overall: overallFrom(overallResult.data, month, currency),
    caps: ((capsResult.data ?? []) as unknown as Record<string, unknown>[]).flatMap(capFrom),
    previousHasBudget: (previousResult.data ?? []).length > 0,
  }
}

type OverallRow = Partial<Record<keyof BudgetMonth, unknown>> | null

/** Every column of a view is nullable to the type generator. A missing month is zero. */
function overallFrom(row: OverallRow, month: IsoDate, currency: string): BudgetMonth {
  if (!row) {
    return {
      month,
      currency,
      budget_id: null,
      budget_amount: null,
      spent: 0,
      expense_count: 0,
      remaining: null,
      used_fraction: null,
    }
  }

  return {
    month,
    currency,
    budget_id: (row.budget_id as string | null) ?? null,
    budget_amount: (row.budget_amount as number | null) ?? null,
    spent: (row.spent as number | null) ?? 0,
    expense_count: (row.expense_count as number | null) ?? 0,
    remaining: (row.remaining as number | null) ?? null,
    // `numeric` arrives as a string over PostgREST, and a fraction is arithmetic.
    used_fraction: toNumber(row.used_fraction),
  }
}

function capFrom(row: Record<string, unknown>): CategoryBudget[] {
  if (!row.budget_id || !row.category_id) return []
  return [
    {
      budget_id: row.budget_id as string,
      month: row.month as IsoDate,
      category_id: row.category_id as string,
      category_name: (row.category_name as string | null) ?? 'Category',
      category_icon: (row.category_icon as string | null) ?? 'DotsThree',
      category_colour_hex: (row.category_colour_hex as string | null) ?? '#6B6357',
      category_bucket: (row.category_bucket as CategoryBudget['category_bucket']) ?? 'life',
      currency: row.currency as string,
      budget_amount: (row.budget_amount as number | null) ?? 0,
      spent: (row.spent as number | null) ?? 0,
      expense_count: (row.expense_count as number | null) ?? 0,
      remaining: (row.remaining as number | null) ?? 0,
      used_fraction: toNumber(row.used_fraction),
    },
  ]
}

function toNumber(value: unknown): number | null {
  if (value === null || value === undefined) return null
  const parsed = typeof value === 'number' ? value : Number(value)
  return Number.isFinite(parsed) ? parsed : null
}
