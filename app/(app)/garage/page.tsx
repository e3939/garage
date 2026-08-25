import type { Metadata } from 'next'
import Link from 'next/link'
import { redirect } from 'next/navigation'

import { ViewSwitcher } from '@/components/totals/view-switcher'
import { VehicleCard } from '@/components/vehicles/vehicle-card'
import { monthStart, todayIso } from '@/lib/dates'
import { monthLabel } from '@/lib/dates-display'
import type { RawSearchParams } from '@/lib/expenses/filters'
import { fetchProfilePreferences } from '@/lib/queries/profile'
import { fetchGarageMonthTotals, fetchVehicles } from '@/lib/queries/vehicles'
import { signedUrls } from '@/lib/storage/signed-url'
import { EMPTY_MONTH_TOTALS, parseSpendView, SPEND_VIEW_PARAM } from '@/lib/views'

export const metadata: Metadata = { title: 'Garage' }

type GaragePageProps = {
  searchParams: Promise<RawSearchParams>
}

function firstParam(value: string | string[] | undefined): string | null {
  if (Array.isArray(value)) return value[0] ?? null
  return value ?? null
}

/**
 * The garage: every car you own, and the switcher between them.
 *
 * An empty garage goes straight to the first-run form. There is nothing here to
 * list and nothing to switch between, so an empty state with a button on it
 * would be a screen whose only purpose is to be tapped through. It also keeps
 * the vehicle form — which is the heaviest client component in this phase — on
 * its own route rather than in the bundle of the one screen a person with five
 * cars looks at every day.
 */
export default async function GaragePage({ searchParams }: GaragePageProps) {
  const raw = await searchParams
  const [preferences, vehicles] = await Promise.all([
    fetchProfilePreferences(),
    fetchVehicles(),
  ])

  if (vehicles.length === 0) redirect('/garage/new')

  const view = parseSpendView(firstParam(raw[SPEND_VIEW_PARAM]), preferences.defaultView)
  const month = monthStart(todayIso())

  const [monthTotals, heroUrls] = await Promise.all([
    fetchGarageMonthTotals(month, preferences.baseCurrency),
    signedUrls(
      'vehicles',
      vehicles.map((vehicle) => vehicle.hero_photo_path),
    ),
  ])

  const search = new URLSearchParams()
  for (const [key, value] of Object.entries(raw)) {
    if (key === SPEND_VIEW_PARAM) continue
    const single = firstParam(value)
    if (single !== null) search.set(key, single)
  }

  return (
    <div className="space-y-6">
      <ViewSwitcher view={view} search={search.toString()} />

      <ul className="space-y-3">
        {vehicles.map((vehicle, index) => (
          <li key={vehicle.id}>
            <VehicleCard
              vehicle={vehicle}
              heroUrl={heroUrls[index] ?? null}
              month={month}
              monthContext={monthLabel(month)}
              monthTotals={monthTotals.get(vehicle.id) ?? EMPTY_MONTH_TOTALS}
              view={view}
              currency={preferences.baseCurrency}
              locale={preferences.locale}
            />
          </li>
        ))}
      </ul>

      <Link
        href="/garage/new"
        className="flex min-h-touch items-center justify-center rounded-md border border-border-strong bg-surface px-4 text-body text-ink"
      >
        Add a vehicle
      </Link>
    </div>
  )
}
