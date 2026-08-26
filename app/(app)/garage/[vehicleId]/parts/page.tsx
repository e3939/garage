import type { Metadata } from 'next'
import { notFound } from 'next/navigation'

import { categoryIconMap } from '@/components/expenses/category-icons'
import { ICON_UI, Nut, Plus } from '@/components/icons'
import { PartsScreen } from '@/components/parts/parts-screen'
import { todayIso } from '@/lib/dates'
import { dateLabel } from '@/lib/dates-display'
import { fetchRankedCategories } from '@/lib/queries/categories'
import { fetchLinkableExpenses, fetchModOptions, fetchParts } from '@/lib/queries/parts'
import { fetchProfilePreferences, fetchUserId } from '@/lib/queries/profile'
import { fetchVehicle } from '@/lib/queries/vehicles'

export const metadata: Metadata = { title: 'Parts' }

type PartsPageProps = {
  params: Promise<{ vehicleId: string }>
}

/**
 * The parts inventory (docs/01-PRODUCT.md, section F).
 *
 * Four round trips, all in parallel: the parts with their two linked expenses
 * already joined, the expenses a new part could have come from, the mods a part
 * can belong to, and the categories the new-expense path needs.
 */
export default async function PartsPage({ params }: PartsPageProps) {
  const { vehicleId } = await params

  const [preferences, vehicle] = await Promise.all([
    fetchProfilePreferences(),
    fetchVehicle(vehicleId),
  ])
  if (!vehicle) notFound()

  const [parts, expenses, mods, categories, userId] = await Promise.all([
    fetchParts(vehicle.id),
    fetchLinkableExpenses(vehicle.id),
    fetchModOptions(vehicle.id),
    fetchRankedCategories(),
    fetchUserId(),
  ])

  const dateLabels: Record<string, string> = {}
  for (const expense of expenses) dateLabels[expense.occurred_on] ??= dateLabel(expense.occurred_on)
  for (const part of parts) {
    if (part.warranty_until) dateLabels[part.warranty_until] ??= dateLabel(part.warranty_until)
  }

  return (
    <PartsScreen
      vehicleId={vehicle.id}
      userId={userId ?? ''}
      parts={parts}
      expenses={expenses}
      mods={mods}
      categories={categories}
      icons={categoryIconMap(categories)}
      addIcon={<Plus size={24} weight="bold" aria-hidden />}
      partIcon={<Nut {...ICON_UI} aria-hidden />}
      currency={preferences.baseCurrency}
      locale={preferences.locale}
      today={todayIso()}
      dateLabels={dateLabels}
    />
  )
}
