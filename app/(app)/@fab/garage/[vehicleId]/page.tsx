import { categoryIconMap } from '@/components/expenses/category-icons'
import { VehicleFab } from '@/components/timeline/vehicle-fab'
import { todayIso } from '@/lib/dates'
import { fetchRankedCategories } from '@/lib/queries/categories'
import { fetchAmortiseThreshold } from '@/lib/queries/expenses'
import { fetchProfilePreferences, fetchUserId } from '@/lib/queries/profile'
import { fetchVehicle, fetchVehicleOptions } from '@/lib/queries/vehicles'

type VehicleFabSlotProps = {
  params: Promise<{ vehicleId: string }>
}

/**
 * The vehicle home is the one screen with a second thing worth adding, so it is
 * the one screen whose FAB grows a secondary action: a timeline note, which is
 * an entry with no cost at all.
 *
 * Everything both sheets need is fetched here in parallel, the same way the
 * default slot does it, so opening either costs no network.
 */
export default async function VehicleFabSlot({ params }: VehicleFabSlotProps) {
  const { vehicleId } = await params

  const [categories, vehicles, preferences, amortiseThreshold, userId, vehicle] = await Promise.all([
    fetchRankedCategories(),
    fetchVehicleOptions(),
    fetchProfilePreferences(),
    fetchAmortiseThreshold(),
    fetchUserId(),
    fetchVehicle(vehicleId),
  ])

  if (!userId || !vehicle) return null

  return (
    <VehicleFab
      vehicleId={vehicle.id}
      userId={userId}
      lastReading={vehicle.odometer_km}
      locale={preferences.locale}
      quickAdd={{
        userId,
        categories,
        icons: categoryIconMap(categories),
        vehicles,
        currency: preferences.baseCurrency,
        locale: preferences.locale,
        amortiseThreshold,
        today: todayIso(),
      }}
    />
  )
}
