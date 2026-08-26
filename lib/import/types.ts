/**
 * What an import is made of, between the file and the commit.
 *
 * Shared client and server: the browser builds a plan and shows it, the server
 * action re-parses the same shapes with zod before anything is written. Nothing
 * here is trusted on the way in — this module only says what the pieces are
 * called.
 */

import type { ExpenseBucket } from '@/lib/expenses/types'

export type ImportFieldKey =
  | 'id'
  | 'occurred_on'
  | 'amount'
  | 'currency'
  | 'category'
  | 'vehicle'
  | 'bucket'
  | 'counts_toward_budget'
  | 'amortize_months'
  | 'merchant'
  | 'note'
  | 'odometer_km'

/** One expense, resolved to ids and ready for `import_expenses`. */
export type ImportExpense = {
  id: string
  occurred_on: string
  amount: number
  currency: string
  category_id: string | null
  vehicle_id: string | null
  bucket: ExpenseBucket
  counts_toward_budget: boolean
  amortize_months: number
  merchant: string | null
  note: string | null
  odometer_km: number | null
}

/** A category the file named that this garage has not got yet. */
export type NewCategory = {
  id: string
  name: string
  icon: string
  colour_hex: string
  default_bucket: ExpenseBucket
  default_counts_toward_budget: boolean
}

export type ImportCategory = {
  id: string
  name: string
  default_bucket: ExpenseBucket
  default_counts_toward_budget: boolean
}

export type ImportVehicle = {
  id: string
  nickname: string
}

/** Everything the planner needs that does not come from the file. */
export type ImportContext = {
  categories: readonly ImportCategory[]
  vehicles: readonly ImportVehicle[]
  /** The profile's base currency, used when the file does not name one. */
  currency: string
  /** Expense ids already in the ledger, so a second import of a file is a no-op. */
  existingIds?: ReadonlySet<string>
}

export type RowStatus = 'ready' | 'skipped'

export type PlannedRow = {
  /** The line in the file, 1-based, so an error can point at something real. */
  line: number
  /** The mapped cells as the file wrote them. This is what the preview shows. */
  cells: Partial<Record<ImportFieldKey, string>>
  expense: ImportExpense | null
  /** Why this row will not import. Empty when it will. */
  errors: string[]
  status: RowStatus
  /** The category name this row would create, if it is the first to name it. */
  newCategory: string | null
}

export type SkipReason = { reason: string; count: number }

export type ImportPlan = {
  rows: PlannedRow[]
  ready: number
  skipped: number
  /** Grouped skip reasons, most common first. The dry-run summary is this. */
  reasons: SkipReason[]
  newCategories: NewCategory[]
  /** True when the file is longer than one commit is allowed to be. */
  overLimit: boolean
}

/**
 * One transaction, one file, and a ceiling on it.
 *
 * Every insert fires the odometer trigger and the milestone trigger, so a very
 * long file is a very long transaction, and a transaction that outlives the
 * request is an import whose outcome nobody knows. Two thousand rows is about
 * five years of daily spending and lands comfortably inside the minute the
 * function is given.
 */
export const IMPORT_ROW_LIMIT = 2000
