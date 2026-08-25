import type { Metadata } from 'next'
import { notFound, redirect } from 'next/navigation'

import { ArchiveVehicle } from '@/components/vehicles/archive-vehicle'
import { VehicleForm } from '@/components/vehicles/vehicle-form'
import { fetchProfilePreferences, fetchUserId } from '@/lib/queries/profile'
import { fetchVehicle } from '@/lib/queries/vehicles'
import { signedUrl } from '@/lib/storage/signed-url'

export const metadata: Metadata = { title: 'Edit vehicle' }

type EditVehiclePageProps = {
  params: Promise<{ vehicleId: string }>
}

export default async function EditVehiclePage({ params }: EditVehiclePageProps) {
  const { vehicleId } = await params

  const [preferences, userId, vehicle] = await Promise.all([
    fetchProfilePreferences(),
    fetchUserId(),
    fetchVehicle(vehicleId),
  ])

  if (!userId) redirect('/sign-in')
  if (!vehicle) notFound()

  const heroUrl = await signedUrl('vehicles', vehicle.hero_photo_path)

  return (
    <div className="space-y-8">
      <VehicleForm
        mode="edit"
        vehicle={vehicle}
        heroUrl={heroUrl}
        userId={userId}
        currency={preferences.baseCurrency}
        locale={preferences.locale}
      />

      <ArchiveVehicle
        vehicleId={vehicle.id}
        nickname={vehicle.nickname}
        archived={vehicle.archived_at !== null}
      />
    </div>
  )
}
