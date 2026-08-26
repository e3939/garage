import type { Route } from 'next'

import { AppHeader } from '@/components/shell/app-header'
import { fetchVehicle } from '@/lib/queries/vehicles'

type PartsHeaderProps = {
  params: Promise<{ vehicleId: string }>
}

export default async function PartsHeader({ params }: PartsHeaderProps) {
  const { vehicleId } = await params
  const vehicle = await fetchVehicle(vehicleId)

  return (
    <AppHeader
      title="Parts"
      back={{ href: `/garage/${vehicleId}` as Route, label: vehicle?.nickname ?? 'Vehicle' }}
    />
  )
}
