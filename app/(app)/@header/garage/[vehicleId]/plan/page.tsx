import type { Route } from 'next'

import { AppHeader } from '@/components/shell/app-header'
import { fetchVehicle } from '@/lib/queries/vehicles'

type PlanHeaderProps = {
  params: Promise<{ vehicleId: string }>
}

/**
 * The board's own header. Back goes to the vehicle rather than to the garage,
 * because the plan is a room inside the car's page and that is where you came
 * from.
 */
export default async function PlanHeader({ params }: PlanHeaderProps) {
  const { vehicleId } = await params
  const vehicle = await fetchVehicle(vehicleId)

  return (
    <AppHeader
      title="Plan"
      back={{
        href: `/garage/${vehicleId}` as Route,
        label: vehicle?.nickname ?? 'Vehicle',
      }}
    />
  )
}
