import { QuickAdd } from '@/components/expenses/quick-add'
import { todayIso } from '@/lib/dates'
import { fetchRankedCategories } from '@/lib/queries/categories'
import { fetchAmortiseThreshold } from '@/lib/queries/expenses'
import { fetchProfilePreferences, fetchUserId } from '@/lib/queries/profile'
import { fetchVehicleOptions } from '@/lib/queries/vehicles'

/**
 * The FAB is persistent, so the default slot is the one that carries it.
 *
 * Everything the quick-add sheet needs is fetched here, in parallel, on the
 * server: the category ranking, the garage, the profile's currency, and the
 * amortisation threshold. The sheet itself receives finished data and finished
 * icons, so opening it costs no network at all.
 */
export default async function DefaultFab() {
  const [categories, vehicles, preferences, amortiseThreshold, userId] = await Promise.all([
    fetchRankedCategories(),
    fetchVehicleOptions(),
    fetchProfilePreferences(),
    fetchAmortiseThreshold(),
    fetchUserId(),
  ])

  // The layout has already redirected anonymous traffic, so this is a type
  // narrowing rather than a check.
  if (!userId) return null

  return (
    <QuickAdd
      userId={userId}
      categories={categories}
      vehicles={vehicles}
      currency={preferences.baseCurrency}
      locale={preferences.locale}
      amortiseThreshold={amortiseThreshold}
      today={todayIso()}
    />
  )
}
