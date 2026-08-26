import type { IsoDate } from '@/lib/dates'
import type { ExpenseBucket } from '@/lib/expenses/types'

/**
 * The overall monthly budget, as `v_budget_month` returns it.
 *
 * `budget_amount` is null when no budget has been set for the month. The spend
 * is still real, so the panel shows the figure and offers to set a budget rather
 * than pretending the month has not happened.
 */
export type BudgetMonth = {
  month: IsoDate
  currency: string
  budget_id: string | null
  budget_amount: number | null
  /** Amortised, budget-affecting spend. The monthly view, from v_expense_impact. */
  spent: number
  expense_count: number
  remaining: number | null
  /** Spent over budget, to four places. Null when there is no budget to be a fraction of. */
  used_fraction: number | null
}

/** One per-category cap, as `v_budget_category_month` returns it. */
export type CategoryBudget = {
  budget_id: string
  month: IsoDate
  category_id: string
  category_name: string
  category_icon: string
  category_colour_hex: string
  category_bucket: ExpenseBucket
  currency: string
  budget_amount: number
  spent: number
  expense_count: number
  remaining: number
  used_fraction: number | null
}

/** Everything the budget screen holds for one month. */
export type BudgetSnapshot = {
  month: IsoDate
  currency: string
  overall: BudgetMonth
  caps: CategoryBudget[]
  /** True when the previous month has something worth copying forward. */
  previousHasBudget: boolean
}

/**
 * Where a figure sits against its budget.
 *
 * Three states, not five. docs/03-DESIGN.md gives the arc one change of colour,
 * at 100%, and explicitly rules out the alarm behaviours that would come with a
 * finer scale: "no shaking, no colour flashing, no alarm. The car metaphor does
 * the emotional work on its own."
 */
export type BudgetState = 'unset' | 'within' | 'over'

export function budgetState(budget: Pick<BudgetMonth, 'budget_amount' | 'used_fraction'>): BudgetState {
  if (budget.budget_amount === null) return 'unset'
  return (budget.used_fraction ?? 0) > 1 ? 'over' : 'within'
}

/** Token, never a hex. docs/03-DESIGN.md. */
export const BUDGET_STATE_COLOUR: Readonly<Record<BudgetState, string>> = {
  unset: 'var(--rule-strong)',
  within: 'var(--positive)',
  over: 'var(--critical)',
}

/**
 * What a category cap is written as before it exists: the sheet holds a text
 * field per category, empty meaning "no cap".
 */
export type CapDraft = {
  category_id: string
  amount: number | null
}
