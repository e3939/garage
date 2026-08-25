import type { AttachmentView } from '@/lib/attachments/types'
import type { IsoDate } from '@/lib/dates'
import type { Enums } from '@/lib/supabase/types'

export type ModStatus = Enums<'mod_status'>
export type ModPriority = Enums<'mod_priority'>

/**
 * The board's columns, in the order docs/01-PRODUCT.md gives them:
 *
 *   Dreaming -> Researching -> Saving -> Ordered -> Installed
 *
 * The enum also holds `abandoned`, which is not a column. A mod you have stopped
 * wanting is not a sixth stage of wanting it; the way out of the plan is to
 * remove the mod, which archives it and keeps every expense it earned. See
 * AUTOPILOT-NOTES.md.
 */
export const BOARD_STATUSES = [
  'dreaming',
  'researching',
  'saving',
  'ordered',
  'installed',
] as const satisfies readonly ModStatus[]

export type BoardStatus = (typeof BOARD_STATUSES)[number]

export function isBoardStatus(value: unknown): value is BoardStatus {
  return typeof value === 'string' && (BOARD_STATUSES as readonly string[]).includes(value)
}

export const MOD_STATUS_LABEL: Readonly<Record<ModStatus, string>> = {
  dreaming: 'Dreaming',
  researching: 'Researching',
  saving: 'Saving',
  ordered: 'Ordered',
  installed: 'Installed',
  abandoned: 'Abandoned',
}

/** One line under a column heading, saying what the column is for. */
export const MOD_STATUS_DESCRIPTION: Readonly<Record<BoardStatus, string>> = {
  dreaming: 'Wants, unexamined.',
  researching: 'Working out what it takes.',
  saving: 'Decided. Putting money aside.',
  ordered: 'Paid for, on its way.',
  installed: 'On the car.',
}

/**
 * Priority is named, not numbered. docs/01-PRODUCT.md: "Numbers imply a
 * precision nobody has about their own wants."
 */
export const MOD_PRIORITIES = ['needed', 'next_up', 'someday', 'dreaming'] as const

export const MOD_PRIORITY_LABEL: Readonly<Record<ModPriority, string>> = {
  needed: 'Needed',
  next_up: 'Next up',
  someday: 'Someday',
  dreaming: 'Dreaming',
}

/** One part link on a mod: a shop, a thread, a spec sheet. */
export type ModLink = { label: string; url: string }

/** A dependency, as the board carries it: enough to name it and to block on it. */
export type ModDependency = {
  id: string
  title: string
  status: ModStatus
}

/**
 * One card, as `mod_board` returns it and after its photos have been signed.
 *
 * `estimate` is the midpoint of the range, computed in SQL by `v_mod_costs` so
 * it agrees with `v_vehicle_totals.planning_accuracy` by construction rather
 * than by two pieces of code happening to round the same way. `actual` is the
 * sum of every expense pointing at the mod, and `variance` is the signed
 * difference — null when nobody wrote down an estimate.
 */
export type ModCard = {
  id: string
  vehicle_id: string
  title: string
  description: string | null
  status: ModStatus
  priority: ModPriority
  est_cost_min: number | null
  est_cost_max: number | null
  estimate: number | null
  actual: number
  variance: number | null
  expense_count: number
  currency: string
  target_date: IsoDate | null
  links: ModLink[]
  notes: string | null
  installed_on: IsoDate | null
  board_order: number
  created_at: string
  depends_on: ModDependency[]
  photos: AttachmentView[]
}

/**
 * The dependencies of a mod that are not on the car yet.
 *
 * docs/01-PRODUCT.md: "a mod whose dependencies aren't installed shows as
 * blocked with the blocker named." Derived here rather than in SQL so the same
 * call that answers "is it blocked" can also say by what.
 */
export function blockers(card: Pick<ModCard, 'depends_on'>): ModDependency[] {
  return card.depends_on.filter((dependency) => dependency.status !== 'installed')
}

/** The build sheet, per status and once more for the whole board. */
export type ModTotals = {
  /** Null on the row that covers the whole board. */
  status: ModStatus | null
  mods: number
  estimate_total: number
  estimate_min_total: number
  estimate_max_total: number
  actual_total: number
  /** How many of those mods carry no estimate at all. Keeps the total honest. */
  without_estimate: number
}

export const EMPTY_TOTALS: ModTotals = {
  status: null,
  mods: 0,
  estimate_total: 0,
  estimate_min_total: 0,
  estimate_max_total: 0,
  actual_total: 0,
  without_estimate: 0,
}

export type ModBoard = {
  cards: ModCard[]
  /** Keyed by status, plus `whole` for the rollup row. */
  totals: Record<BoardStatus, ModTotals> & { whole: ModTotals }
  currency: string
}

/**
 * Planning accuracy as a percentage, and what it means in a sentence.
 *
 * `v_vehicle_totals.planning_accuracy` is sum(actual) / sum(estimate) across
 * installed mods. One hundred per cent is a plan that came true; anything above
 * it is spending more than you said you would.
 *
 * The reading rounds to whole per cent, so a ratio a hair off 1.0 reads as
 * "about what you plan" rather than as "0% more", which is a sentence that says
 * nothing twice.
 */
export function planningAccuracyReading(ratio: number | null): string | null {
  if (ratio === null || !Number.isFinite(ratio)) return null
  const percent = Math.round((ratio - 1) * 100)
  if (percent === 0) return 'You spend about what you plan.'
  if (percent > 0) return `You spend ${percent}% more than you plan.`
  return `You spend ${Math.abs(percent)}% less than you plan.`
}
