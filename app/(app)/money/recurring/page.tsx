import type { Metadata } from 'next'

import { categoryIconMap } from '@/components/expenses/category-icons'
import { RecurringList } from '@/components/recurring/recurring-list'
import { todayIso } from '@/lib/dates'
import { dateLabel } from '@/lib/dates-display'
import { fetchRankedCategories } from '@/lib/queries/categories'
import { fetchProfilePreferences } from '@/lib/queries/profile'
import { fetchRecurringTemplates } from '@/lib/queries/recurring'
import { fetchVehicleOptions } from '@/lib/queries/vehicles'

export const metadata: Metadata = { title: 'Recurring' }

export default async function RecurringPage() {
  const today = todayIso()
  const preferences = await fetchProfilePreferences()

  const [templates, categories, vehicles] = await Promise.all([
    fetchRecurringTemplates(),
    fetchRankedCategories(),
    fetchVehicleOptions(),
  ])

  // The dates each row prints, in words, on the server — the client bundle does
  // not carry a locale's worth of month names for a dozen rows.
  const dueLabels: Record<string, string> = {}
  for (const template of templates) {
    dueLabels[template.next_due] ??= dateLabel(template.next_due)
  }

  return (
    <div className="space-y-6">
      <p className="text-body text-ink-muted">
        A template does not write anything on its own. On its due date it puts a draft in the tray
        on Today, and the draft counts toward nothing until you confirm it.
      </p>

      <RecurringList
        templates={templates}
        categories={categories}
        icons={categoryIconMap(categories)}
        vehicles={vehicles}
        currency={preferences.baseCurrency}
        locale={preferences.locale}
        today={today}
        dueLabels={dueLabels}
      />
    </div>
  )
}
