import type { Metadata } from 'next'
import Link from 'next/link'

import { categoryIconMap } from '@/components/expenses/category-icons'
import { MonthTotal } from '@/components/expenses/month-total'
import { LedgerList } from '@/components/ledger/ledger-list'
import { monthStart, todayIso } from '@/lib/dates'
import { EMPTY_FILTERS } from '@/lib/expenses/filters'
import { fetchRankedCategories } from '@/lib/queries/categories'
import { fetchAmortiseThreshold, fetchLedgerPage, fetchMonthSummary } from '@/lib/queries/expenses'
import { fetchProfilePreferences } from '@/lib/queries/profile'
import { fetchVehicleOptions } from '@/lib/queries/vehicles'

export const metadata: Metadata = { title: 'Today' }

/** How much of the ledger the month-at-a-glance panel shows before deferring. */
const RECENT_ROWS = 6

export default async function TodayPage() {
  const today = todayIso()
  const month = monthStart(today)

  const preferences = await fetchProfilePreferences()

  const [summary, recent, categories, vehicles, amortiseThreshold] = await Promise.all([
    fetchMonthSummary(month, preferences.baseCurrency),
    fetchLedgerPage(EMPTY_FILTERS, null, RECENT_ROWS),
    fetchRankedCategories(),
    fetchVehicleOptions(),
    fetchAmortiseThreshold(),
  ])

  return (
    <div className="space-y-6">
      <MonthTotal
        month={month}
        serverTotal={summary.total}
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
              vehicles={vehicles}
              currency={preferences.baseCurrency}
              locale={preferences.locale}
              amortiseThreshold={amortiseThreshold}
              today={today}
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
