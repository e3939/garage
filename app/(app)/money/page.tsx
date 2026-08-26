import type { Metadata } from 'next'
import Link from 'next/link'

import { BudgetEditor } from '@/components/budget/budget-editor'
import { BudgetPanel } from '@/components/budget/budget-panel'
import { categoryIconMap } from '@/components/expenses/category-icons'
import { FundList } from '@/components/funds/fund-list'
import { addMonthsToMonthStart, monthStart, todayIso } from '@/lib/dates'
import { monthLabel, monthLabelsFrom } from '@/lib/dates-display'
import { fetchBudgetSnapshot } from '@/lib/queries/budgets'
import { fetchRankedCategories } from '@/lib/queries/categories'
import { fetchFunds } from '@/lib/queries/funds'
import { fetchModOptions } from '@/lib/queries/mods'
import { fetchProfilePreferences } from '@/lib/queries/profile'
import { fetchVehicleOptions } from '@/lib/queries/vehicles'

export const metadata: Metadata = { title: 'Money' }

/** How far ahead the fund sheet can name a month. Five years, see `monthLabelsFrom`. */
const PROJECTION_MONTHS = 60

export default async function MoneyPage() {
  const today = todayIso()
  const month = monthStart(today)
  const previousMonth = addMonthsToMonthStart(month, -1)

  const preferences = await fetchProfilePreferences()

  const [snapshot, categories, funds, vehicles, mods] = await Promise.all([
    fetchBudgetSnapshot(month, preferences.baseCurrency),
    fetchRankedCategories(),
    fetchFunds(),
    fetchVehicleOptions(),
    fetchModOptions(),
  ])

  const icons = categoryIconMap(categories)
  const monthLabels = monthLabelsFrom(month, PROJECTION_MONTHS)

  return (
    <div className="space-y-8">
      <BudgetPanel
        snapshot={snapshot}
        monthLabel={monthLabel(month)}
        locale={preferences.locale}
        icons={icons}
        editor={
          <BudgetEditor
            snapshot={snapshot}
            previousMonth={previousMonth}
            previousMonthLabel={monthLabel(previousMonth)}
            monthLabel={monthLabel(month)}
            categories={categories}
            icons={icons}
            locale={preferences.locale}
          />
        }
      />

      <FundList
        funds={funds}
        vehicles={vehicles.map((vehicle) => ({ id: vehicle.id, nickname: vehicle.nickname }))}
        mods={mods}
        currency={preferences.baseCurrency}
        locale={preferences.locale}
        today={today}
        monthLabels={monthLabels}
      />

      <nav className="space-y-2" aria-label="More money screens">
        <h2 className="text-eyebrow font-display uppercase text-ink-muted">Elsewhere</h2>
        <ul className="overflow-hidden rounded-md border border-border bg-surface">
          <li className="border-b border-border">
            <Link href="/money/reports" className="flex min-h-touch items-center justify-between gap-3 px-3 py-3">
              <span className="text-body text-ink">Reports</span>
              <span className="text-caption text-ink-muted">
                Month over month, categories, life against car
              </span>
            </Link>
          </li>
          <li>
            <Link href="/money/recurring" className="flex min-h-touch items-center justify-between gap-3 px-3 py-3">
              <span className="text-body text-ink">Recurring</span>
              <span className="text-caption text-ink-muted">Templates and when they next land</span>
            </Link>
          </li>
        </ul>
      </nav>
    </div>
  )
}
