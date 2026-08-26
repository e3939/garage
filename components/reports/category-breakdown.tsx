import type { ReactNode } from 'react'

import { Money } from '@/components/ui/money'
import type { CategoryReportRow } from '@/lib/reports/types'

type CategoryBreakdownProps = {
  rows: readonly CategoryReportRow[]
  currency: string
  locale: string
  icons: Record<string, ReactNode>
}

/**
 * Where the money went, ranked.
 *
 * Ordered by the all-in figure, because "what did I spend the most on" is a
 * question about money that left the account, not about how it was spread. The
 * monthly figure travels on the same row anyway — a category whose two numbers
 * are far apart is one carrying a spread purchase, and that is worth being able
 * to see without switching anything.
 *
 * The bar is a share of the largest row, not of the total. A share of the total
 * makes every row after the first two look identical at the width a phone has.
 */
export function CategoryBreakdown({ rows, currency, locale, icons }: CategoryBreakdownProps) {
  const visible = rows.filter((row) => row.all_in_total !== 0 || row.monthly_total !== 0)

  if (visible.length === 0) {
    return (
      <p className="rounded-md border border-border bg-surface p-4 text-body text-ink-muted">
        Nothing spent in this period yet.
      </p>
    )
  }

  const peak = Math.max(...visible.map((row) => Math.abs(row.all_in_total)), 1)

  return (
    <ul className="overflow-hidden rounded-md border border-border bg-surface">
      {visible.map((row) => {
        const width = (Math.max(row.all_in_total, 0) / peak) * 100
        const colour = row.colour_hex ?? 'var(--bucket-life)'

        return (
          <li
            key={row.category_id ?? 'uncategorised'}
            className="space-y-2 border-b border-border px-3 py-3 last:border-b-0"
          >
            <div className="flex items-baseline justify-between gap-3">
              <span className="flex min-w-0 items-center gap-2">
                <span className="shrink-0" style={{ color: colour }} aria-hidden>
                  {row.icon ? icons[row.icon] : null}
                </span>
                <span className="truncate text-body text-ink">
                  {row.name ?? 'No category'}
                </span>
              </span>
              <Money
                amount={row.all_in_total}
                currency={currency}
                locale={locale}
                size="odometer"
              />
            </div>

            <div className="h-1.5 w-full overflow-hidden rounded-full bg-surface-sunken">
              <div
                className="h-full rounded-full"
                style={{ width: `${width.toFixed(1)}%`, backgroundColor: colour }}
              />
            </div>

            <p className="text-caption text-ink-muted">
              {`${row.expense_count === 1 ? '1 expense' : `${row.expense_count} expenses`} · `}
              <Money
                amount={row.monthly_total}
                currency={currency}
                locale={locale}
                size="label"
              />
              {' counted toward the budget'}
            </p>
          </li>
        )
      })}
    </ul>
  )
}
