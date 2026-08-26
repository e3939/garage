import 'server-only'

import { DEFAULT_CURRENCY } from '@/lib/money'
import { createClient } from '@/lib/supabase/server'
import type {
  BucketReportRow,
  CategoryReportRow,
  MonthPoint,
  ReportRange,
  ReportSnapshot,
  TopExpenseRow,
} from '@/lib/reports/types'

/** How many expenses the largest-of-the-period list holds. */
export const TOP_EXPENSE_LIMIT = 10

/**
 * A whole report, in four parallel reads.
 *
 * Every one of them is an RPC that aggregates in Postgres and returns tens of
 * rows (CLAUDE.md section 3). Nothing is summed here, and nothing downloads a
 * period of expenses to reduce them in the browser — which matters more on this
 * screen than anywhere else in the app, because a twelve-month report is the one
 * query in the codebase that could plausibly touch a thousand rows.
 *
 * Both figures travel together on every row: the monthly one, amortised, out of
 * `v_expense_impact`, and the all-in one at full amount on the day it was paid.
 * The screen shows both side by side rather than picking a side.
 */
export async function fetchReport(
  range: ReportRange,
  currency: string = DEFAULT_CURRENCY,
): Promise<ReportSnapshot> {
  const supabase = await createClient()

  const [months, categories, buckets, top] = await Promise.all([
    supabase.rpc('report_months', {
      p_from: range.from,
      p_to: range.to,
      p_currency: currency,
    }),
    supabase.rpc('report_categories', {
      p_from: range.from,
      p_to: range.to,
      p_currency: currency,
    }),
    supabase.rpc('report_buckets', {
      p_from: range.from,
      p_to: range.to,
      p_currency: currency,
    }),
    supabase.rpc('report_top_expenses', {
      p_from: range.from,
      p_to: range.to,
      p_currency: currency,
      p_limit: TOP_EXPENSE_LIMIT,
    }),
  ])

  if (months.error) throw new Error(`report_months failed: ${months.error.message}`)
  if (categories.error) throw new Error(`report_categories failed: ${categories.error.message}`)
  if (buckets.error) throw new Error(`report_buckets failed: ${buckets.error.message}`)
  if (top.error) throw new Error(`report_top_expenses failed: ${top.error.message}`)

  return {
    range,
    currency,
    months: (months.data ?? []) as unknown as MonthPoint[],
    categories: (categories.data ?? []) as unknown as CategoryReportRow[],
    buckets: (buckets.data ?? []) as unknown as BucketReportRow[],
    top: (top.data ?? []) as unknown as TopExpenseRow[],
  }
}
