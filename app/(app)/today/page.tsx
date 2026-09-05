import type { Metadata } from 'next'
import Link from 'next/link'

import { categoryIconMap } from '@/components/expenses/category-icons'
import { MonthTotal } from '@/components/expenses/month-total'
import { QuickAddButton } from '@/components/expenses/quick-add-button'
import { Receipt } from '@/components/icons'
import { EmptyState } from '@/components/ui/empty-state'
import { LedgerList } from '@/components/ledger/ledger-list'
import { DraftTray } from '@/components/recurring/draft-tray'
import { ledgerSignalIcons } from '@/components/ledger/row-signals'
import { ViewSwitcher } from '@/components/totals/view-switcher'
import { monthStart, todayIso } from '@/lib/dates'
import { dateLabel, monthLabel } from '@/lib/dates-display'
import { filtersForView, type RawSearchParams } from '@/lib/expenses/filters'
import { fetchRankedCategories } from '@/lib/queries/categories'
import { fetchAmortiseThreshold, fetchLedgerPage, fetchMonthSummary } from '@/lib/queries/expenses'
import { fetchProfilePreferences, fetchUserId } from '@/lib/queries/profile'
import { fetchDraftExpenses } from '@/lib/queries/recurring'
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

  const [summary, recent, categories, vehicles, amortiseThreshold, userId, drafts] =
    await Promise.all([
      fetchMonthSummary(month, preferences.baseCurrency),
      fetchLedgerPage(filtersForView(view), null, RECENT_ROWS),
      fetchRankedCategories(),
      fetchVehicleOptions(),
      fetchAmortiseThreshold(),
      fetchUserId(),
      fetchDraftExpenses(),
    ])

  // The dates the tray prints, in words, on the server. See `lib/dates-display.ts`.
  const draftDates: Record<string, string> = {}
  for (const draft of drafts) draftDates[draft.occurred_on] ??= dateLabel(draft.occurred_on)

  return (
    <div className="space-y-6">
      {/* Above the month's figure, because it is the one thing on this screen
          that is asking rather than telling. */}
      <DraftTray drafts={drafts} locale={preferences.locale} dateLabels={draftDates} />

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
          <EmptyState icon={Receipt} action={<QuickAddButton />}>
            Nothing logged yet. Add your first expense and the month starts counting.
          </EmptyState>
        ) : (
          <>
            <LedgerList
              // The panel is a window on the ledger, not a page of it: paging
              // happens over on /ledger, so this copy never offers to load more.
              page={{ rows: recent.rows, cursor: null, hasMore: false }}
              filters={filtersForView(view)}
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
