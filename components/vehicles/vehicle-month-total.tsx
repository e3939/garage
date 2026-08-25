// Reads the optimistic queue so the figure moves before the server answers.
'use client'

import { useExpenseStore } from '@/components/expenses/expense-store'
import { Total } from '@/components/totals/total'
import type { IsoDate } from '@/lib/dates'
import { pendingVehicleMonthDelta } from '@/lib/expenses/optimistic'
import { SPEND_VIEW_LABEL, totalForView, type MonthViewTotals, type SpendView } from '@/lib/views'

type VehicleMonthTotalProps = {
  vehicleId: string
  month: IsoDate
  /** "August 2026", formatted on the server. See `MonthTotal` for why. */
  monthContext: string
  /** All three figures for this vehicle, from `v_vehicle_month_totals`. */
  totals: MonthViewTotals
  view: SpendView
  currency: string
  locale: string
}

/**
 * This month's spend on one car, under the view on screen.
 *
 * All-in and car-only are identical for a vehicle — the check constraint on
 * `expenses` will not let a car carry a life expense — so two of the three
 * positions show the same number. That is not a bug and it is not hidden: the
 * label above the figure says which one is being shown, and a figure that
 * quietly stopped responding to the switcher would be the worse lie.
 */
export function VehicleMonthTotal({
  vehicleId,
  month,
  monthContext,
  totals,
  view,
  currency,
  locale,
}: VehicleMonthTotalProps) {
  const { pending } = useExpenseStore()
  const total =
    totalForView(totals, view) +
    pendingVehicleMonthDelta(pending, vehicleId, month, currency, view)

  return (
    <Total
      name="This month"
      view={SPEND_VIEW_LABEL[view]}
      context={monthContext}
      amount={total}
      currency={currency}
      locale={locale}
    />
  )
}
