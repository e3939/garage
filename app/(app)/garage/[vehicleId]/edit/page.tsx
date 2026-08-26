import type { Metadata } from 'next'
import { notFound, redirect } from 'next/navigation'

import { ArchiveVehicle } from '@/components/vehicles/archive-vehicle'
import { SellVehicle } from '@/components/vehicles/sell-vehicle'
import { VehicleForm } from '@/components/vehicles/vehicle-form'
import { todayIso } from '@/lib/dates'
import { dateLabel } from '@/lib/dates-display'
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

      <SellVehicle
        vehicleId={vehicle.id}
        nickname={vehicle.nickname}
        sold={vehicle.status === 'sold'}
        soldDate={vehicle.sold_date}
        soldDateLabel={vehicle.sold_date ? dateLabel(vehicle.sold_date) : null}
        soldPrice={vehicle.sold_price}
        currency={vehicle.currency ?? preferences.baseCurrency}
        locale={preferences.locale}
        today={todayIso()}
      />

      {/* Archiving is the other way out: a car you kept but stopped tracking.
          A sold car is already archived, so the control would be a no-op. */}
      {vehicle.status === 'sold' ? null : (
        <ArchiveVehicle
          vehicleId={vehicle.id}
          nickname={vehicle.nickname}
          archived={vehicle.archived_at !== null}
        />
      )}
    </div>
  )
}
