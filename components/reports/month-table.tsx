import { Money } from '@/components/ui/money'
import type { MonthPoint } from '@/lib/reports/types'

type MonthTableProps = {
  months: readonly MonthPoint[]
  currency: string
  locale: string
  /** "August 2026" per month, formatted on the server. */
  monthLabels: Readonly<Record<string, string>>
}

/**
 * The chart's numbers, in full.
 *
 * This is what a tooltip would have said, except that it is all visible at once,
 * it is set in tabular mono so the columns line up, and reading it does not
 * require a pointing device. On a phone that is not a compromise, it is the
 * better of the two.
 *
 * Newest month first, which is the opposite of the chart's left-to-right and
 * deliberately so: a chart is read as a shape over time, a list is read from the
 * top and the top should be now.
 */
export function MonthTable({ months, currency, locale, monthLabels }: MonthTableProps) {
  if (months.length === 0) return null

  const newestFirst = [...months].reverse()

  return (
    <table className="w-full">
      <thead>
        <tr className="border-b border-border">
          <th scope="col" className="py-2 text-left text-caption font-normal text-ink-muted">
            Month
          </th>
          <th scope="col" className="py-2 text-right text-caption font-normal text-ink-muted">
            Monthly
          </th>
          <th scope="col" className="py-2 text-right text-caption font-normal text-ink-muted">
            All-in
          </th>
        </tr>
      </thead>
      <tbody>
        {newestFirst.map((point) => (
          <tr key={point.month} className="border-b border-border last:border-b-0">
            <th scope="row" className="py-2 text-left text-caption font-normal text-ink">
              {monthLabels[point.month] ?? point.month}
            </th>
            <td className="py-2 text-right">
              <Money
                amount={point.monthly_total}
                currency={currency}
                locale={locale}
                size="label"
                className="text-positive"
              />
            </td>
            <td className="py-2 text-right">
              <Money
                amount={point.all_in_total}
                currency={currency}
                locale={locale}
                size="label"
              />
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}
