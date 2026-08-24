// Reads the optimistic queue so the figure moves before the server answers.
'use client'

import { useExpenseStore } from '@/components/expenses/expense-store'
import { Money } from '@/components/ui/money'
import { monthLabel, type IsoDate } from '@/lib/dates'
import { pendingMonthDelta } from '@/lib/expenses/optimistic'

type MonthTotalProps = {
  /** First of the month. */
  month: IsoDate
  /** Summed by `v_monthly_impact`; amortisation is already applied. */
  serverTotal: number
  currency: string
  locale: string
}

/**
 * The month's budget figure, on the recessed strip from docs/03-DESIGN.md.
 *
 * The number comes from SQL. The only thing added here is the impact of writes
 * still in flight, computed by the mirror of `v_expense_impact` in
 * `lib/budget.ts` — which is what makes the figure move the instant Save is
 * tapped rather than a round-trip later.
 *
 * The label is not decoration: a total without its view named is ambiguous, and
 * this one is the budget view, not the all-in one.
 */
export function MonthTotal({ month, serverTotal, currency, locale }: MonthTotalProps) {
  const { pending } = useExpenseStore()
  const total = serverTotal + pendingMonthDelta(pending, month, currency)

  return (
    <section className="panel-sunken rounded-md px-4 py-5">
      <p className="text-eyebrow font-display uppercase text-ink-muted">
        Monthly · {monthLabel(month)}
      </p>
      <p className="mt-2">
        <Money amount={total} currency={currency} locale={locale} size="odometer-lg" />
      </p>
      <p className="mt-2 text-caption text-ink-muted">
        Counts only what is set to affect the budget, spread over the months it was
        spread across.
      </p>
    </section>
  )
}
