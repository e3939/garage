import type { Route } from 'next'

import { AppHeader } from '@/components/shell/app-header'
import { fetchVehicle } from '@/lib/queries/vehicles'

type ServiceHeaderProps = {
  params: Promise<{ vehicleId: string }>
}

/** Back goes to the car, because the service book is a room inside its page. */
export default async function ServiceHeader({ params }: ServiceHeaderProps) {
  const { vehicleId } = await params
  const vehicle = await fetchVehicle(vehicleId)

  return (
    <AppHeader
      title="Service"
      back={{ href: `/garage/${vehicleId}` as Route, label: vehicle?.nickname ?? 'Vehicle' }}
    />
  )
}
