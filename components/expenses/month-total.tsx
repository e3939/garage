// Reads the optimistic queue so the figure moves before the server answers.
'use client'

import { useExpenseStore } from '@/components/expenses/expense-store'
import { Total } from '@/components/totals/total'
import { monthLabel, type IsoDate } from '@/lib/dates'
import { pendingMonthDelta } from '@/lib/expenses/optimistic'
import {
  SPEND_VIEW_DESCRIPTION,
  SPEND_VIEW_LABEL,
  totalForView,
  type MonthViewTotals,
  type SpendView,
} from '@/lib/views'

type MonthTotalProps = {
  /** First of the month. */
  month: IsoDate
  /** All three figures, computed by `v_month_totals`. */
  totals: MonthViewTotals
  /** Which one is on screen. From the URL, falling back to the profile. */
  view: SpendView
  currency: string
  locale: string
}

/**
 * The month's figure, on the recessed strip from docs/03-DESIGN.md.
 *
 * All three numbers come from SQL and all three arrive together, so flipping the
 * switcher is a re-render rather than a fetch. The only thing added here is the
 * impact of writes still in flight, computed by the mirror of `v_month_totals`
 * in `lib/expenses/optimistic.ts` — which is what makes the figure move the
 * instant Save is tapped rather than a round-trip later.
 *
 * The label is not decoration. The same expenses produce three different
 * figures, and a figure without its view named is a number nobody can act on.
 */
export function MonthTotal({ month, totals, view, currency, locale }: MonthTotalProps) {
  const { pending } = useExpenseStore()
  const total = totalForView(totals, view) + pendingMonthDelta(pending, month, currency, view)

  return (
    <Total
      view={SPEND_VIEW_LABEL[view]}
      context={monthLabel(month)}
      emphasis="hero"
      amount={total}
      currency={currency}
      locale={locale}
      caption={SPEND_VIEW_DESCRIPTION[view]}
    />
  )
}
