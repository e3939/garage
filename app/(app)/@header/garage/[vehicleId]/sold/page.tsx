import type { Route } from 'next'

import { AppHeader } from '@/components/shell/app-header'
import { fetchVehicle } from '@/lib/queries/vehicles'

type SoldHeaderProps = {
  params: Promise<{ vehicleId: string }>
}

export default async function SoldHeader({ params }: SoldHeaderProps) {
  const { vehicleId } = await params
  const vehicle = await fetchVehicle(vehicleId)

  return (
    <AppHeader
      title="Closing summary"
      back={{ href: `/garage/${vehicleId}` as Route, label: vehicle?.nickname ?? 'Vehicle' }}
    />
  )
}
