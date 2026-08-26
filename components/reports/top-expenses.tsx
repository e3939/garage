import { Money } from '@/components/ui/money'
import { BUCKET_LABEL, BUCKET_VAR } from '@/lib/expenses/types'
import type { TopExpenseRow } from '@/lib/reports/types'

type TopExpensesProps = {
  rows: readonly TopExpenseRow[]
  locale: string
  /** "12 Mar 2026" per row, formatted on the server. */
  dateLabels: Readonly<Record<string, string>>
}

/**
 * The largest expenses of the period, at full amount on the day they were paid.
 *
 * The detail line carries structured fields only — bucket, category, vehicle, in
 * that order — and never the note or the merchant blurb, for the reason set out
 * at length in docs/03-DESIGN.md: the line truncates rather than wraps, and free
 * text always wins that competition by being longer.
 *
 * A row that was spread says so, because a two-million expense that contributes
 * a sixth of that to each of twelve months is not the same event as one that
 * landed all at once, and this is the list where somebody is deciding whether it
 * was worth it.
 */
export function TopExpenses({ rows, locale, dateLabels }: TopExpensesProps) {
  if (rows.length === 0) {
    return (
      <p className="rounded-md border border-border bg-surface p-4 text-body text-ink-muted">
        Nothing spent in this period yet.
      </p>
    )
  }

  return (
    <ol className="overflow-hidden rounded-md border border-border bg-surface">
      {rows.map((row) => (
        <li key={row.id} className="border-b border-border px-3 py-2 last:border-b-0">
          <div className="flex items-baseline justify-between gap-3">
            <span className="min-w-0 flex-1 truncate text-body text-ink">
              {row.merchant ?? row.category_name ?? 'Expense'}
            </span>
            <Money amount={row.amount} currency={row.currency} locale={locale} size="odometer" />
          </div>
          <p className="flex items-baseline gap-2 truncate text-caption text-ink-muted">
            <span className="shrink-0" style={{ color: BUCKET_VAR[row.bucket] }}>
              {BUCKET_LABEL[row.bucket]}
            </span>
            <span className="truncate">
              {[
                row.category_name,
                row.vehicle_nickname,
                dateLabels[row.occurred_on] ?? row.occurred_on,
                row.amortize_months > 1 ? `spread over ${row.amortize_months} months` : null,
              ]
                .filter(Boolean)
                .join(' · ')}
            </span>
          </p>
        </li>
      ))}
    </ol>
  )
}
