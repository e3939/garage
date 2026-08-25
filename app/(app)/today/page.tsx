import type { Metadata } from 'next'
import Link from 'next/link'

import { categoryIconMap } from '@/components/expenses/category-icons'
import { MonthTotal } from '@/components/expenses/month-total'
import { LedgerList } from '@/components/ledger/ledger-list'
import { ledgerSignalIcons } from '@/components/ledger/row-signals'
import { ViewSwitcher } from '@/components/totals/view-switcher'
import { monthStart, todayIso } from '@/lib/dates'
import { monthLabel } from '@/lib/dates-display'
import { EMPTY_FILTERS, type RawSearchParams } from '@/lib/expenses/filters'
import { fetchRankedCategories } from '@/lib/queries/categories'
import { fetchAmortiseThreshold, fetchLedgerPage, fetchMonthSummary } from '@/lib/queries/expenses'
import { fetchProfilePreferences, fetchUserId } from '@/lib/queries/profile'
import { fetchVehicleOptions } from '@/lib/queries/vehicles'
import { parseSpendView, SPEND_VIEW_PARAM } from '@/lib/views'

export const metadata: Metadata = { title: 'Today' }

/** How much of the ledger the month-at-a-glance panel shows before deferring. */
const RECENT_ROWS = 6

type TodayPageProps = {
  searchParams: Promise<RawSearchParams>
}

function firstParam(value: string | string[] | undefined): string | null {
  if (Array.isArray(value)) return value[0] ?? null
  return value ?? null
}

export default async function TodayPage({ searchParams }: TodayPageProps) {
  const today = todayIso()
  const month = monthStart(today)
  const raw = await searchParams

  const preferences = await fetchProfilePreferences()
  const view = parseSpendView(firstParam(raw[SPEND_VIEW_PARAM]), preferences.defaultView)

  const [summary, recent, categories, vehicles, amortiseThreshold, userId] = await Promise.all([
    fetchMonthSummary(month, preferences.baseCurrency),
    fetchLedgerPage(EMPTY_FILTERS, null, RECENT_ROWS),
    fetchRankedCategories(),
    fetchVehicleOptions(),
    fetchAmortiseThreshold(),
    fetchUserId(),
  ])

  return (
    <div className="space-y-6">
      <ViewSwitcher view={view} />

      <MonthTotal
        month={month}
        monthContext={monthLabel(month)}
        totals={summary.totals}
        view={view}
        currency={preferences.baseCurrency}
        locale={preferences.locale}
      />

      <section className="space-y-3">
        <h2 className="text-eyebrow font-display uppercase text-ink-muted">Latest</h2>
        {recent.rows.length === 0 ? (
          <p className="rounded-md border border-border bg-surface p-6 text-body text-ink-muted">
            Nothing logged yet. Tap the plus to add your first expense.
          </p>
        ) : (
          <>
            <LedgerList
              // The panel is a window on the ledger, not a page of it: paging
              // happens over on /ledger, so this copy never offers to load more.
              page={{ rows: recent.rows, cursor: null, hasMore: false }}
              filters={EMPTY_FILTERS}
              categories={categories}
              icons={categoryIconMap(categories)}
              signals={ledgerSignalIcons()}
              vehicles={vehicles}
              currency={preferences.baseCurrency}
              locale={preferences.locale}
              amortiseThreshold={amortiseThreshold}
              today={today}
              userId={userId ?? ''}
            />
            <Link href="/ledger" className="inline-block min-h-touch text-label text-accent">
              Open the ledger
            </Link>
          </>
        )}
      </section>
    </div>
  )
}
