import type { Metadata } from 'next'

import { categoryIconMap } from '@/components/expenses/category-icons'
import { LedgerFiltersBar } from '@/components/ledger/ledger-filters'
import { LedgerList } from '@/components/ledger/ledger-list'
import { ledgerSignalIcons } from '@/components/ledger/row-signals'
import { todayIso } from '@/lib/dates'
import { parseFilters, type RawSearchParams } from '@/lib/expenses/filters'
import { fetchRankedCategories } from '@/lib/queries/categories'
import { fetchAmortiseThreshold, fetchLedgerPage } from '@/lib/queries/expenses'
import { fetchProfilePreferences } from '@/lib/queries/profile'
import { fetchVehicleOptions } from '@/lib/queries/vehicles'

export const metadata: Metadata = { title: 'Ledger' }

type LedgerPageProps = {
  searchParams: Promise<RawSearchParams>
}

/**
 * Everything on this screen is read on the server: the page of rows, its day
 * subtotals, the category ranking and the amortisation threshold. Filters are
 * URL state, so a filtered ledger is a different server render rather than a
 * client-side pass over rows the browser had to download first.
 */
export default async function LedgerPage({ searchParams }: LedgerPageProps) {
  const filters = parseFilters(await searchParams)

  const [page, categories, vehicles, preferences, amortiseThreshold] = await Promise.all([
    fetchLedgerPage(filters),
    fetchRankedCategories(),
    fetchVehicleOptions(),
    fetchProfilePreferences(),
    fetchAmortiseThreshold(),
  ])

  const icons = categoryIconMap(categories)

  return (
    <section>
      <LedgerFiltersBar
        filters={filters}
        categories={categories}
        icons={icons}
        vehicles={vehicles}
        currency={preferences.baseCurrency}
        locale={preferences.locale}
      />
      <LedgerList
        page={page}
        filters={filters}
        categories={categories}
        icons={icons}
        signals={ledgerSignalIcons()}
        vehicles={vehicles}
        currency={preferences.baseCurrency}
        locale={preferences.locale}
        amortiseThreshold={amortiseThreshold}
        today={todayIso()}
      />
    </section>
  )
}
