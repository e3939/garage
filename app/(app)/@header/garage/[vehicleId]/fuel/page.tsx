import type { Route } from 'next'

import { AppHeader } from '@/components/shell/app-header'
import { fetchVehicle } from '@/lib/queries/vehicles'

type FuelHeaderProps = {
  params: Promise<{ vehicleId: string }>
}

export default async function FuelHeader({ params }: FuelHeaderProps) {
  const { vehicleId } = await params
  const vehicle = await fetchVehicle(vehicleId)

  return (
    <AppHeader
      title="Fuel"
      back={{ href: `/garage/${vehicleId}` as Route, label: vehicle?.nickname ?? 'Vehicle' }}
    />
  )
}
