import type { Route } from 'next'

import { AppHeader } from '@/components/shell/app-header'
import { fetchVehicle } from '@/lib/queries/vehicles'

type EditVehicleHeaderProps = {
  params: Promise<{ vehicleId: string }>
}

export default async function EditVehicleHeader({ params }: EditVehicleHeaderProps) {
  const { vehicleId } = await params
  const vehicle = await fetchVehicle(vehicleId)

  return (
    <AppHeader
      title="Edit vehicle"
      back={{
        href: `/garage/${vehicleId}` as Route,
        label: vehicle?.nickname ?? 'Vehicle',
      }}
    />
  )
}
