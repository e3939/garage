import type { Metadata } from 'next'
import { notFound } from 'next/navigation'

import { GalleryScreen } from '@/components/gallery/gallery-screen'
import { StorageMeter } from '@/components/gallery/storage-meter'
import { todayIso } from '@/lib/dates'
import { fetchGalleryAlbums, fetchGalleryPhotos, fetchStorageUsage } from '@/lib/queries/gallery'
import { fetchUserId } from '@/lib/queries/profile'
import { fetchVehicle } from '@/lib/queries/vehicles'

export const metadata: Metadata = { title: 'Gallery' }

type GalleryPageProps = {
  params: Promise<{ vehicleId: string }>
}

/**
 * The gallery for one vehicle.
 *
 * Everything the grid needs is read here, in parallel, on the server. Only
 * thumbnails are signed — the originals are signed one at a time, when
 * something asks to open or download one, because signing forty megabytes worth
 * of URLs to draw forty tiles is the thumbnail's entire purpose spent.
 */
export default async function GalleryPage({ params }: GalleryPageProps) {
  const { vehicleId } = await params

  const vehicle = await fetchVehicle(vehicleId)
  if (!vehicle) notFound()

  const [photos, albums, usage, userId] = await Promise.all([
    fetchGalleryPhotos(vehicle.id),
    fetchGalleryAlbums(vehicle.id),
    fetchStorageUsage(),
    fetchUserId(),
  ])

  return (
    <div className="space-y-5">
      <StorageMeter usage={usage} />
      <GalleryScreen
        userId={userId ?? ''}
        vehicleId={vehicle.id}
        vehicleName={vehicle.nickname}
        photos={photos}
        albums={albums}
        usage={usage}
        today={todayIso()}
      />
    </div>
  )
}
