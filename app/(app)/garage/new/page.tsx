import type { Metadata } from 'next'
import { redirect } from 'next/navigation'

import { VehicleForm } from '@/components/vehicles/vehicle-form'
import { fetchProfilePreferences, fetchUserId } from '@/lib/queries/profile'
import { fetchVehicles } from '@/lib/queries/vehicles'

export const metadata: Metadata = { title: 'Add a vehicle' }

/**
 * Adding a car, and — with an empty garage, which is where `/garage` sends you —
 * the first-run flow.
 *
 * It is one form either way. The only thing that changes is the framing above
 * it: the first car is the moment every figure in the app starts working, and
 * the fifth is a form.
 */
export default async function NewVehiclePage() {
  const [preferences, userId, vehicles] = await Promise.all([
    fetchProfilePreferences(),
    fetchUserId(),
    fetchVehicles(),
  ])

  if (!userId) redirect('/sign-in')

  const first = vehicles.length === 0

  return (
    <div className="space-y-6">
      {first ? (
        <section className="space-y-2">
          <h2 className="font-display text-display-lg text-ink">Add your car</h2>
          <p className="text-body text-ink-muted">
            The name is the only thing that matters today. Everything else can wait until you
            know it, and every figure in the app starts working the moment there is a car to
            attach an expense to.
          </p>
        </section>
      ) : (
        <p className="text-body text-ink-muted">
          Only the name is required. Trim, plate, fuel and transmission are behind More and
          can be filled in whenever you feel like it.
        </p>
      )}

      <VehicleForm
        mode="create"
        userId={userId}
        currency={preferences.baseCurrency}
        locale={preferences.locale}
        first={first}
      />
    </div>
  )
}
