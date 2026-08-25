import type { Route } from 'next'
import Link from 'next/link'

import { AppHeader } from '@/components/shell/app-header'
import { fetchVehicle } from '@/lib/queries/vehicles'

type VehicleHeaderProps = {
  params: Promise<{ vehicleId: string }>
}

/**
 * The nickname is the screen title, so it is not repeated in the page body. The
 * header is sticky and the hero is not; repeating it would put the same word on
 * screen twice for the whole scroll.
 */
export default async function VehicleHeader({ params }: VehicleHeaderProps) {
  const { vehicleId } = await params
  const vehicle = await fetchVehicle(vehicleId)

  return (
    <AppHeader
      title={vehicle?.nickname ?? 'Vehicle'}
      back={{ href: '/garage', label: 'Garage' }}
      actions={
        vehicle ? (
          <Link
            href={`/garage/${vehicle.id}/edit` as Route}
            className="min-h-touch rounded-md px-3 text-label text-accent"
          >
            Edit
          </Link>
        ) : null
      }
    />
  )
}
