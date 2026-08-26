import type { Metadata } from 'next'

import { categoryIconMap } from '@/components/expenses/category-icons'
import { QuickAddButton } from '@/components/expenses/quick-add-button'
import { ChartDonut } from '@/components/icons'
import { EmptyState } from '@/components/ui/empty-state'
import { CategoryBreakdown } from '@/components/reports/category-breakdown'
import { MonthChart } from '@/components/reports/month-chart'
import { MonthTable } from '@/components/reports/month-table'
import { PeriodSwitcher } from '@/components/reports/period-switcher'
import { SplitBar } from '@/components/reports/split-bar'
import { TopExpenses } from '@/components/reports/top-expenses'
import { todayIso } from '@/lib/dates'
import { dateLabel, monthLabel } from '@/lib/dates-display'
import { fetchRankedCategories } from '@/lib/queries/categories'
import { fetchProfilePreferences } from '@/lib/queries/profile'
import { fetchReport, TOP_EXPENSE_LIMIT } from '@/lib/queries/reports'
import { parseReportPeriod, rangeFor, REPORT_PERIOD_PARAM } from '@/lib/reports/types'
import { axisScale } from '@/lib/reports/axis'

export const metadata: Metadata = { title: 'Reports' }

type ReportsPageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}

function firstParam(value: string | string[] | undefined): string | null {
  if (Array.isArray(value)) return value[0] ?? null
  return value ?? null
}

/**
 * The reports.
 *
 * Four questions, in the order somebody actually asks them: how have the months
 * gone, what did I spend it on, how much of it is the car, and what were the big
 * ones. Every figure carries both views — the monthly one, amortised, and the
 * all-in one at full amount on the day it was paid — because the whole point of
 * this app is that a month with one big purchase in it has two honest numbers
 * and picking one of them for you is the thing it refuses to do.
 *
 * Everything on this route is a Server Component. The four charts are SVG, the
 * period switcher is three links, and the route ships no JavaScript of its own.
 */
export default async function ReportsPage({ searchParams }: ReportsPageProps) {
  const raw = await searchParams
  const period = parseReportPeriod(firstParam(raw[REPORT_PERIOD_PARAM]))
  const range = rangeFor(period, todayIso())

  const preferences = await fetchProfilePreferences()

  const [report, categories] = await Promise.all([
    fetchReport(range, preferences.baseCurrency),
    fetchRankedCategories(true),
  ])

  // The dates and months these screens print, in words, on the server.
  const monthLabels: Record<string, string> = {}
  for (const point of report.months) monthLabels[point.month] ??= monthLabel(point.month)

  const dateLabels: Record<string, string> = {}
  for (const row of report.top) dateLabels[row.occurred_on] ??= dateLabel(row.occurred_on)

  const peak = Math.max(
    0,
    ...report.months.map((point) => Math.max(point.monthly_total, point.all_in_total)),
  )
  const scale = axisScale(peak, report.currency)

  // Four charts each saying "nothing spent in this period yet" is one screen
  // saying it four times. When the period is genuinely empty the page says it
  // once, with the one thing there is to do about it.
  if (report.months.every((point) => point.all_in_total === 0) && report.top.length === 0) {
    return (
      <div className="space-y-8">
        <PeriodSwitcher period={period} />

        <EmptyState icon={ChartDonut} action={<QuickAddButton />}>
          Nothing spent in this period. The reports fill in as the ledger does.
        </EmptyState>
      </div>
    )
  }

  return (
    <div className="space-y-8">
      <PeriodSwitcher period={period} />

      <section className="space-y-3">
        <div className="space-y-1">
          <h2 className="text-eyebrow font-display uppercase text-ink-muted">Month over month</h2>
          <p className="text-caption text-ink-muted">
            {`${monthLabels[range.from] ?? range.from} to ${monthLabels[range.to] ?? range.to}`}
            {scale.unit === '' ? null : `. Axis in ${scale.unit}.`}
          </p>
        </div>

        <div className="rounded-md border border-border bg-surface p-3">
          <MonthChart months={report.months} currency={report.currency} />
          <p className="mt-2 flex flex-wrap items-center gap-4 text-caption text-ink-muted">
            <span className="flex items-center gap-2">
              <span
                aria-hidden
                className="size-2 rounded-full"
                style={{ backgroundColor: 'var(--positive)' }}
              />
              Monthly — what counts toward the budget, spread
            </span>
            <span className="flex items-center gap-2">
              <span
                aria-hidden
                className="size-2 rounded-full"
                style={{ backgroundColor: 'var(--bucket-life)' }}
              />
              All-in — everything, on the day it was paid
            </span>
          </p>
        </div>

        <MonthTable
          months={report.months}
          currency={report.currency}
          locale={preferences.locale}
          monthLabels={monthLabels}
        />
      </section>

      <section className="space-y-3">
        <h2 className="text-eyebrow font-display uppercase text-ink-muted">Life against car</h2>
        <SplitBar
          buckets={report.buckets}
          currency={report.currency}
          locale={preferences.locale}
        />
      </section>

      <section className="space-y-3">
        <h2 className="text-eyebrow font-display uppercase text-ink-muted">By category</h2>
        <CategoryBreakdown
          rows={report.categories}
          currency={report.currency}
          locale={preferences.locale}
          icons={categoryIconMap(categories)}
        />
      </section>

      <section className="space-y-3">
        <h2 className="text-eyebrow font-display uppercase text-ink-muted">
          {`Largest ${TOP_EXPENSE_LIMIT}`}
        </h2>
        <TopExpenses rows={report.top} locale={preferences.locale} dateLabels={dateLabels} />
      </section>
    </div>
  )
}
