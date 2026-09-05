import { QuickAdd } from '@/components/expenses/quick-add'
import { todayIso } from '@/lib/dates'
import { fetchRankedCategories } from '@/lib/queries/categories'
import { fetchAmortiseThreshold } from '@/lib/queries/expenses'
import { fetchProfilePreferences, fetchUserId } from '@/lib/queries/profile'
import { fetchVehicleOptions } from '@/lib/queries/vehicles'

/**
 * The FAB, and the data its sheet opens with.
 *
 * Every route that should carry it renders this from its own page in the slot,
 * rather than leaning on `default.tsx`. A parallel-route slot only falls back
 * to `default` on a hard load: on a client-side navigation a slot with no
 * matching segment keeps whatever it was last showing. So going Today ->
 * Settings, where the slot resolves to null, and back to Today left the FAB
 * null — it had nothing to match on the way back, so it held the null. One page
 * per destination gives it something to match.
 *
 * Everything the quick-add sheet needs is fetched here, in parallel, on the
 * server: the category ranking, the garage, the profile's currency, and the
 * amortisation threshold. The sheet itself receives finished data and finished
 * icons, so opening it costs no network at all.
 */
export async function QuickAddFab() {
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
