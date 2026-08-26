import type { AttachmentView } from '@/lib/attachments/types'
import type { IsoDate } from '@/lib/dates'
import type { Enums } from '@/lib/supabase/types'

export type PartStatus = Enums<'part_status'>

/**
 * docs/01-PRODUCT.md, section F: "What's on the car and what's on the shelf."
 * The inventory is grouped by these, in this order — what is fitted, what is
 * waiting, then what has left.
 */
export const PART_STATUSES = ['on_car', 'shelf', 'sold', 'binned'] as const satisfies readonly PartStatus[]

export const PART_STATUS_LABEL: Readonly<Record<PartStatus, string>> = {
  on_car: 'On the car',
  shelf: 'On the shelf',
  sold: 'Sold',
  binned: 'Binned',
}

export const PART_STATUS_DESCRIPTION: Readonly<Record<PartStatus, string>> = {
  on_car: 'Fitted and in use.',
  shelf: 'Off the car and kept.',
  sold: 'Gone, and it paid some of itself back.',
  binned: 'Gone, and it did not.',
}

/** What removing a part from the car does with it. */
export const REMOVAL_OUTCOMES = ['shelf', 'sold', 'binned'] as const
export type RemovalOutcome = (typeof REMOVAL_OUTCOMES)[number]

export const REMOVAL_LABEL: Readonly<Record<RemovalOutcome, string>> = {
  shelf: 'Keep',
  sold: 'Sell',
  binned: 'Bin',
}

export type Part = {
  id: string
  vehicle_id: string
  name: string
  brand: string | null
  part_number: string | null
  status: PartStatus
  installed_on: IsoDate | null
  removed_on: IsoDate | null
  warranty_until: IsoDate | null
  expense_id: string | null
  sale_expense_id: string | null
  mod_plan_id: string | null
  notes: string | null
  /** The purchase, in minor units. Null when no expense is linked. */
  cost: number | null
  /** The sale, which is stored as a negative expense. Null when not sold. */
  sale: number | null
  currency: string | null
  mod_title: string | null
  photo_count: number
}

export type PartsInventory = {
  parts: Part[]
  photos: Record<string, AttachmentView[]>
}

/**
 * An expense a part can be created from, and a mod it can be attached to.
 * Both are pickers, so both carry just enough to be recognised in a list.
 */
export type ExpenseOption = {
  id: string
  occurred_on: IsoDate
  amount: number
  currency: string
  label: string
  mod_plan_id: string | null
}

export type ModOption = {
  id: string
  title: string
}

/**
 * What a part has cost, net of what it sold for.
 *
 * The sale is stored as a negative expense (docs/01-PRODUCT.md: "Selling records
 * a negative expense so the true cost of a mod nets out correctly"), so netting
 * is an addition rather than a subtraction and the sign takes care of itself.
 */
export function netCost(part: Pick<Part, 'cost' | 'sale'>): number | null {
  if (part.cost === null && part.sale === null) return null
  return (part.cost ?? 0) + (part.sale ?? 0)
}

/** Warranty is only worth saying while it is still true. */
export function warrantyState(
  part: Pick<Part, 'warranty_until'>,
  today: IsoDate,
): 'none' | 'live' | 'expired' {
  if (!part.warranty_until) return 'none'
  return part.warranty_until >= today ? 'live' : 'expired'
}
