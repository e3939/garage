import type { Route } from 'next'

import { AppHeader } from '@/components/shell/app-header'
import { fetchVehicle } from '@/lib/queries/vehicles'

type GalleryHeaderProps = {
  params: Promise<{ vehicleId: string }>
}

export default async function GalleryHeader({ params }: GalleryHeaderProps) {
  const { vehicleId } = await params
  const vehicle = await fetchVehicle(vehicleId)

  return (
    <AppHeader
      title="Gallery"
      back={{ href: `/garage/${vehicleId}` as Route, label: vehicle?.nickname ?? 'Vehicle' }}
    />
  )
}
