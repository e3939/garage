import { AppHeader } from '@/components/shell/app-header'
import { fetchVehicles } from '@/lib/queries/vehicles'

/**
 * No way back on the first car. `/garage` redirects an empty garage here, so a
 * back link would land on the screen that sent you and bounce straight back.
 */
export default async function NewVehicleHeader() {
  const vehicles = await fetchVehicles()

  return (
    <AppHeader
      title="Add a vehicle"
      {...(vehicles.length > 0 ? { back: { href: '/garage' as const, label: 'Garage' } } : {})}
    />
  )
}
