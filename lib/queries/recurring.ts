import 'server-only'

import { createClient } from '@/lib/supabase/server'
import type { DraftExpense, RecurringTemplate } from '@/lib/recurring/types'

const DRAFT_COLUMNS = [
  'id',
  'occurred_on',
  'amount',
  'currency',
  'category_id',
  'category_name',
  'category_icon',
  'category_colour_hex',
  'vehicle_id',
  'vehicle_nickname',
  'bucket',
  'counts_toward_budget',
  'amortize_months',
  'merchant',
  'note',
  'recurring_id',
  'recurring_label',
  'recurring_cadence',
  'created_at',
].join(', ')

/**
 * Every template, soonest due first, with inactive ones at the bottom.
 *
 * The join is a plain embed rather than a view: this list is a dozen rows on a
 * screen nobody opens daily, and a view would be a fifth object to keep in step
 * with the schema for no measurable gain.
 */
export async function fetchRecurringTemplates(): Promise<RecurringTemplate[]> {
  const supabase = await createClient()

  const { data, error } = await supabase
    .from('recurring_expenses')
    .select(
      'id, label, amount, currency, category_id, vehicle_id, bucket, counts_toward_budget, cadence, day_of_month, month_of_year, next_due, active, categories(name, icon, colour_hex), vehicles(nickname)',
    )
    .order('active', { ascending: false })
    .order('next_due', { ascending: true })

  if (error) throw new Error(`recurring_expenses failed: ${error.message}`)

  type Raw = {
    id: string
    label: string
    amount: number | null
    currency: string | null
    category_id: string | null
    vehicle_id: string | null
    bucket: RecurringTemplate['bucket']
    counts_toward_budget: boolean | null
    cadence: RecurringTemplate['cadence']
    day_of_month: number | null
    month_of_year: number | null
    next_due: string
    active: boolean
    categories: { name: string; icon: string; colour_hex: string } | null
    vehicles: { nickname: string } | null
  }

  return ((data ?? []) as unknown as Raw[]).map((row) => ({
    id: row.id,
    label: row.label,
    amount: row.amount,
    currency: row.currency ?? 'VND',
    category_id: row.category_id,
    category_name: row.categories?.name ?? null,
    category_icon: row.categories?.icon ?? null,
    category_colour_hex: row.categories?.colour_hex ?? null,
    vehicle_id: row.vehicle_id,
    vehicle_nickname: row.vehicles?.nickname ?? null,
    bucket: row.bucket,
    counts_toward_budget: row.counts_toward_budget,
    cadence: row.cadence,
    day_of_month: row.day_of_month,
    month_of_year: row.month_of_year,
    next_due: row.next_due,
    active: row.active,
  }))
}

/**
 * The confirmation tray: generated expenses waiting for somebody to say yes.
 *
 * Drafts are invisible everywhere else in the app on purpose — they are out of
 * `v_expense_impact`, `v_month_totals`, `v_timeline` and `ledger_page` — so this
 * is the only query in the codebase that returns one. Oldest first, because the
 * one that has been waiting longest is the one to deal with.
 */
export async function fetchDraftExpenses(limit = 20): Promise<DraftExpense[]> {
  const supabase = await createClient()

  const { data, error } = await supabase
    .from('v_draft_expenses')
    .select(DRAFT_COLUMNS)
    .order('occurred_on', { ascending: true })
    .order('created_at', { ascending: true })
    .limit(limit)

  if (error) throw new Error(`v_draft_expenses failed: ${error.message}`)

  return ((data ?? []) as unknown as Record<string, unknown>[]).flatMap((row) => {
    if (!row.id) return []
    return [
      {
        id: row.id as string,
        occurred_on: row.occurred_on as string,
        amount: (row.amount as number | null) ?? 0,
        currency: (row.currency as string | null) ?? 'VND',
        category_id: (row.category_id as string | null) ?? null,
        category_name: (row.category_name as string | null) ?? null,
        category_icon: (row.category_icon as string | null) ?? null,
        category_colour_hex: (row.category_colour_hex as string | null) ?? null,
        vehicle_id: (row.vehicle_id as string | null) ?? null,
        vehicle_nickname: (row.vehicle_nickname as string | null) ?? null,
        bucket: (row.bucket as DraftExpense['bucket']) ?? 'life',
        counts_toward_budget: (row.counts_toward_budget as boolean | null) ?? true,
        amortize_months: (row.amortize_months as number | null) ?? 1,
        merchant: (row.merchant as string | null) ?? null,
        note: (row.note as string | null) ?? null,
        recurring_id: (row.recurring_id as string | null) ?? null,
        recurring_label: (row.recurring_label as string | null) ?? null,
        recurring_cadence: (row.recurring_cadence as DraftExpense['recurring_cadence']) ?? null,
        created_at: (row.created_at as string | null) ?? '',
      },
    ]
  })
}
