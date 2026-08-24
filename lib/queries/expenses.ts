import 'server-only'

import { createClient } from '@/lib/supabase/server'
import type { LedgerCursor, LedgerRow } from '@/lib/expenses/types'
import type { LedgerFilters } from '@/lib/expenses/filters'
import { monthStart, todayIso, type IsoDate } from '@/lib/dates'
import { DEFAULT_CURRENCY } from '@/lib/money'

/** How many rows a ledger page holds. Also the point virtualisation kicks in. */
export const LEDGER_PAGE_SIZE = 40

export type LedgerPage = {
  rows: LedgerRow[]
  /** Pass back to fetch the next page. Null when the ledger is exhausted. */
  cursor: LedgerCursor | null
  hasMore: boolean
}

/**
 * One keyset page of the ledger.
 *
 * Every filter, the ordering, the day subtotals and the attachment counts are
 * done by `ledger_page`. Nothing is reduced here — this function shapes the
 * result and nothing else.
 */
export async function fetchLedgerPage(
  filters: LedgerFilters,
  cursor: LedgerCursor | null = null,
  limit: number = LEDGER_PAGE_SIZE,
): Promise<LedgerPage> {
  const supabase = await createClient()

  // Ask for one more than we show, so "is there another page" needs no count.
  const { data, error } = await supabase.rpc('ledger_page', {
    p_limit: limit + 1,
    p_cursor_occurred_on: cursor?.occurred_on,
    p_cursor_created_at: cursor?.created_at,
    p_cursor_id: cursor?.id,
    p_from: filters.from ?? undefined,
    p_to: filters.to ?? undefined,
    p_category_ids: filters.categoryIds.length ? filters.categoryIds : undefined,
    p_buckets: filters.buckets.length ? filters.buckets : undefined,
    p_vehicle_ids: filters.vehicleIds.length ? filters.vehicleIds : undefined,
    p_has_photo: filters.hasPhoto ?? undefined,
    p_amount_min: filters.amountMin ?? undefined,
    p_amount_max: filters.amountMax ?? undefined,
    p_search: filters.search || undefined,
  })

  if (error) throw new Error(`ledger_page failed: ${error.message}`)

  const all = (data ?? []) as unknown as LedgerRow[]
  const hasMore = all.length > limit
  const rows = hasMore ? all.slice(0, limit) : all
  const last = rows[rows.length - 1]

  return {
    rows,
    cursor: hasMore && last ? { occurred_on: last.occurred_on, created_at: last.created_at, id: last.id } : null,
    hasMore,
  }
}

export type MonthSummary = {
  month: IsoDate
  currency: string
  /** Budget-impact total for the month, amortisation already applied. */
  total: number
  expenseCount: number
}

/**
 * The monthly figure. Read straight out of `v_monthly_impact`, which sums the
 * slices `v_expense_impact` produces — the only implementation of amortisation
 * in the system.
 */
export async function fetchMonthSummary(
  month: IsoDate = monthStart(todayIso()),
  currency: string = DEFAULT_CURRENCY,
): Promise<MonthSummary> {
  const supabase = await createClient()

  const { data, error } = await supabase
    .from('v_monthly_impact')
    .select('impact_month, currency, total, expense_count')
    .eq('impact_month', month)
    .eq('currency', currency)
    .maybeSingle()

  if (error) throw new Error(`v_monthly_impact failed: ${error.message}`)

  return {
    month,
    currency,
    total: data?.total ?? 0,
    expenseCount: data?.expense_count ?? 0,
  }
}

/**
 * The amount above which the form offers to spread a cost over months: the
 * median of the last 90 days times the profile's multiplier. Null when there is
 * not enough history to take a median of, and the form then stays quiet.
 */
export async function fetchAmortiseThreshold(): Promise<number | null> {
  const supabase = await createClient()

  const { data, error } = await supabase
    .from('v_amortise_suggestion')
    .select('threshold')
    .maybeSingle()

  if (error) throw new Error(`v_amortise_suggestion failed: ${error.message}`)
  return data?.threshold ?? null
}
