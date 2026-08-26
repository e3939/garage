import type { IsoDate } from '@/lib/dates'
import type { Cadence } from '@/lib/recurring/cadence'
import type { ExpenseBucket } from '@/lib/expenses/types'

/** A template row, with the category and vehicle it files under. */
export type RecurringTemplate = {
  id: string
  label: string
  amount: number | null
  currency: string
  category_id: string | null
  category_name: string | null
  category_icon: string | null
  category_colour_hex: string | null
  vehicle_id: string | null
  vehicle_nickname: string | null
  bucket: ExpenseBucket | null
  counts_toward_budget: boolean | null
  cadence: Cadence
  day_of_month: number | null
  month_of_year: number | null
  next_due: IsoDate
  active: boolean
}

/**
 * One expense waiting in the confirmation tray, as `v_draft_expenses` returns
 * it. Nothing here counts toward any total: a draft is invisible to
 * `v_expense_impact`, `v_month_totals`, `v_timeline` and `ledger_page` until it
 * is confirmed.
 */
export type DraftExpense = {
  id: string
  occurred_on: IsoDate
  amount: number
  currency: string
  category_id: string | null
  category_name: string | null
  category_icon: string | null
  category_colour_hex: string | null
  vehicle_id: string | null
  vehicle_nickname: string | null
  bucket: ExpenseBucket
  counts_toward_budget: boolean
  amortize_months: number
  merchant: string | null
  note: string | null
  recurring_id: string | null
  recurring_label: string | null
  recurring_cadence: Cadence | null
  created_at: string
}
