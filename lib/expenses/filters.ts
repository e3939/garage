/**
 * Ledger filters live in the URL. That makes them shareable, survivable across a
 * refresh, and — because the ledger page is a Server Component — the thing the
 * SQL is parameterised by, with no client state in between.
 *
 * The same shape is handed to `ledger_page` on the server and used to decide
 * whether an optimistic row belongs on screen before the server has answered.
 */

import type { IsoDate } from '@/lib/dates'
import { isIsoDate } from '@/lib/dates'
import type { ExpenseBucket, LedgerRow } from '@/lib/expenses/types'
import { BUCKETS } from '@/lib/expenses/types'

export type LedgerFilters = {
  from: IsoDate | null
  to: IsoDate | null
  categoryIds: string[]
  buckets: ExpenseBucket[]
  vehicleIds: string[]
  /** null: do not care. true: has at least one attachment. false: has none. */
  hasPhoto: boolean | null
  /** Minor units, compared against the signed amount. */
  amountMin: number | null
  amountMax: number | null
  search: string
}

export const EMPTY_FILTERS: LedgerFilters = {
  from: null,
  to: null,
  categoryIds: [],
  buckets: [],
  vehicleIds: [],
  hasPhoto: null,
  amountMin: null,
  amountMax: null,
  search: '',
}

/** Next hands search params through as this shape. */
export type RawSearchParams = Record<string, string | string[] | undefined>

function first(value: string | string[] | undefined): string | null {
  if (Array.isArray(value)) return value[0] ?? null
  return value ?? null
}

function list(value: string | string[] | undefined): string[] {
  const raw = Array.isArray(value) ? value : value === undefined ? [] : [value]
  return raw
    .flatMap((entry) => entry.split(','))
    .map((entry) => entry.trim())
    .filter((entry) => entry !== '')
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

function integer(value: string | null): number | null {
  if (value === null || value.trim() === '') return null
  const parsed = Number(value)
  return Number.isSafeInteger(parsed) ? parsed : null
}

function isoOrNull(value: string | null): IsoDate | null {
  return value !== null && isIsoDate(value) ? value : null
}

/**
 * Anything unreadable is dropped rather than rejected. A hand-edited URL should
 * show a ledger, not an error page.
 */
export function parseFilters(params: RawSearchParams): LedgerFilters {
  const photo = first(params.photo)

  return {
    from: isoOrNull(first(params.from)),
    to: isoOrNull(first(params.to)),
    categoryIds: list(params.cat).filter((id) => UUID.test(id)),
    buckets: list(params.bucket).filter((value): value is ExpenseBucket =>
      (BUCKETS as readonly string[]).includes(value),
    ),
    vehicleIds: list(params.veh).filter((id) => UUID.test(id)),
    hasPhoto: photo === 'yes' ? true : photo === 'no' ? false : null,
    amountMin: integer(first(params.min)),
    amountMax: integer(first(params.max)),
    search: (first(params.q) ?? '').trim().slice(0, 120),
  }
}

/** The inverse. Empty entries are omitted so a cleared filter leaves no trace. */
export function filtersToSearchParams(filters: LedgerFilters): URLSearchParams {
  const params = new URLSearchParams()
  if (filters.from) params.set('from', filters.from)
  if (filters.to) params.set('to', filters.to)
  if (filters.categoryIds.length) params.set('cat', filters.categoryIds.join(','))
  if (filters.buckets.length) params.set('bucket', filters.buckets.join(','))
  if (filters.vehicleIds.length) params.set('veh', filters.vehicleIds.join(','))
  if (filters.hasPhoto !== null) params.set('photo', filters.hasPhoto ? 'yes' : 'no')
  if (filters.amountMin !== null) params.set('min', String(filters.amountMin))
  if (filters.amountMax !== null) params.set('max', String(filters.amountMax))
  if (filters.search) params.set('q', filters.search)
  return params
}

/** How many filters are on. Drives the count on the Filter button. */
export function activeFilterCount(filters: LedgerFilters): number {
  let count = 0
  if (filters.from || filters.to) count += 1
  if (filters.categoryIds.length) count += 1
  if (filters.buckets.length) count += 1
  if (filters.vehicleIds.length) count += 1
  if (filters.hasPhoto !== null) count += 1
  if (filters.amountMin !== null || filters.amountMax !== null) count += 1
  if (filters.search) count += 1
  return count
}

export function isEmptyFilters(filters: LedgerFilters): boolean {
  return activeFilterCount(filters) === 0
}

/**
 * The client half of the filter, used only for optimistic rows.
 *
 * A row that has just been written locally has to decide for itself whether it
 * belongs in the list the user is looking at. It mirrors the predicate in
 * `ledger_page`, minus `has_photo`, which cannot be known before the row exists
 * — a pending row has no attachments, so it is treated as having none.
 */
export function matchesFilters(row: LedgerRow, filters: LedgerFilters): boolean {
  if (row.is_draft) return false
  if (filters.from && row.occurred_on < filters.from) return false
  if (filters.to && row.occurred_on > filters.to) return false
  if (filters.categoryIds.length && (row.category_id === null || !filters.categoryIds.includes(row.category_id)))
    return false
  if (filters.buckets.length && !filters.buckets.includes(row.bucket)) return false
  if (filters.vehicleIds.length && (row.vehicle_id === null || !filters.vehicleIds.includes(row.vehicle_id)))
    return false
  if (filters.hasPhoto !== null && filters.hasPhoto !== (row.attachment_count > 0)) return false
  if (filters.amountMin !== null && row.amount < filters.amountMin) return false
  if (filters.amountMax !== null && row.amount > filters.amountMax) return false
  if (filters.search) {
    const needle = filters.search.toLowerCase()
    const haystack = `${row.note ?? ''} ${row.merchant ?? ''}`.toLowerCase()
    if (!haystack.includes(needle)) return false
  }
  return true
}
