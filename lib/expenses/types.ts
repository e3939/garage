import type { Enums } from '@/lib/supabase/types'
import type { IsoDate } from '@/lib/dates'

export type ExpenseBucket = Enums<'expense_bucket'>

export const BUCKETS: readonly ExpenseBucket[] = ['life', 'car_running', 'car_project']

/** The label used wherever a bucket is named. Core vocabulary, docs/01-PRODUCT.md. */
export const BUCKET_LABEL: Readonly<Record<ExpenseBucket, string>> = {
  life: 'Life',
  car_running: 'Running',
  car_project: 'Project',
}

/** One sentence explaining what the bucket means, for the form. */
export const BUCKET_DESCRIPTION: Readonly<Record<ExpenseBucket, string>> = {
  life: 'Everything that is not the car.',
  car_running: 'The cost of the car existing and moving.',
  car_project: 'Discretionary spend to make the car more than it was.',
}

/** Bucket colours are tokens, not hexes. docs/03-DESIGN.md. */
export const BUCKET_VAR: Readonly<Record<ExpenseBucket, string>> = {
  life: 'var(--bucket-life)',
  car_running: 'var(--bucket-car-running)',
  car_project: 'var(--bucket-car-project)',
}

/**
 * One row of the ledger, as `ledger_page` returns it.
 *
 * The generated `Database` type marks every column of a `returns table` function
 * as non-null because Postgres does not record nullability there. This type is
 * the honest version and is what the app passes around.
 */
export type LedgerRow = {
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
  odometer_km: number | null
  is_draft: boolean
  attachment_count: number
  created_at: string
  /** Subtotal of the whole day under the current filters. Computed in SQL. */
  day_total: number
  /** How many expenses that day holds under the current filters. */
  day_count: number
}

/** The keyset cursor: the last row of the page just rendered. */
export type LedgerCursor = {
  occurred_on: IsoDate
  created_at: string
  id: string
}

export function cursorOf(row: LedgerRow): LedgerCursor {
  return { occurred_on: row.occurred_on, created_at: row.created_at, id: row.id }
}

/** A category as the form and the chips need it. */
export type CategoryOption = {
  id: string
  name: string
  icon: string
  colour_hex: string
  default_bucket: ExpenseBucket
  default_counts_toward_budget: boolean
  is_system: boolean
  archived_at: string | null
  sort_order: number | null
  uses_recent: number
  uses_all: number
  last_used_on: IsoDate | null
}

/** A vehicle, reduced to what an expense needs to know about it. */
export type VehicleOption = {
  id: string
  nickname: string
  colour_hex: string | null
  odometer_km: number
}
