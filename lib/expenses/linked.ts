/**
 * The expense that comes with something else.
 *
 * Three screens in Phase 6 write an expense as part of another act: marking a
 * service done, logging a fill-up, and buying a part. In every case the expense
 * is not the point — the service record, the tank of fuel and the part are the
 * point — and the user should not have to visit the ledger afterwards to say
 * what it cost.
 *
 * So the money lives in the same sheet, behind one switch, and this builds the
 * write. It is the same `ExpenseWrite` the ledger builds, produced by the same
 * `lib/budget.ts` rules, so an expense written this way is not a second kind of
 * expense.
 */

import { resolveBucket, resolveCountsTowardBudget, type CategoryDefaults } from '@/lib/budget'
import type { IsoDate } from '@/lib/dates'
import type { ExpenseWrite } from '@/lib/expenses/schema'
import type { CategoryOption } from '@/lib/expenses/types'

export type LinkedExpenseInput = {
  /** Minor units. Null or zero means there is nothing to write. */
  amount: number | null
  currency: string
  occurredOn: IsoDate
  vehicleId: string
  category: CategoryOption | null
  merchant: string | null
  note: string | null
  odometerKm: number | null
  /** Set when the spend belongs to a mod, so the mod's actual is right. */
  modPlanId?: string | null
}

/**
 * Build the expense, or null when there is nothing to build.
 *
 * The bucket and the budget switch are resolved rather than stated: a fill-up
 * filed under Fuel is running spend that counts toward the month, and a part
 * filed under Mods & Parts is project spend that does not, and both of those
 * come out of the category the user picked rather than out of a literal in this
 * file. A vehicle is always attached, because all three callers are on a car.
 */
export function buildLinkedExpense(input: LinkedExpenseInput): ExpenseWrite | null {
  if (input.amount === null || input.amount === 0) return null

  const category: CategoryDefaults | null = input.category
    ? {
        default_bucket: input.category.default_bucket,
        default_counts_toward_budget: input.category.default_counts_toward_budget,
      }
    : null

  const bucket = resolveBucket({ category, hasVehicle: true })
  const counts = resolveCountsTowardBudget({ category, bucket })

  return {
    id: crypto.randomUUID(),
    occurred_on: input.occurredOn,
    amount: input.amount,
    currency: input.currency,
    category_id: input.category?.id ?? null,
    vehicle_id: input.vehicleId,
    bucket,
    counts_toward_budget: counts,
    amortize_months: 1,
    merchant: input.merchant,
    note: input.note,
    odometer_km: input.odometerKm,
    ...(input.modPlanId ? { mod_plan_id: input.modPlanId } : {}),
  }
}

/**
 * Where a kind of spend files itself by default.
 *
 * Categories are renameable, so a rename must not start filing fuel under
 * Groceries. The name is tried first and the fallback is the first live category
 * in the right bucket. Null when there is no such category at all, and then the
 * sheet opens with the chips unanswered rather than guessing — the same rule the
 * mod board uses for "Mods & Parts".
 */
export function defaultCategory(
  categories: readonly CategoryOption[],
  name: string,
  bucket: CategoryDefaults['default_bucket'],
): CategoryOption | null {
  const live = categories.filter((category) => category.archived_at === null)
  return live.find((category) => category.name === name)
    ?? live.find((category) => category.default_bucket === bucket)
    ?? null
}
