import type { Metadata } from 'next'
import type { Route } from 'next'
import Link from 'next/link'
import { redirect } from 'next/navigation'

import { ViewSwitcher } from '@/components/totals/view-switcher'
import { VehicleCard } from '@/components/vehicles/vehicle-card'
import { monthStart, todayIso } from '@/lib/dates'
import { dateLabel, monthLabel } from '@/lib/dates-display'
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
  const [preferences, all] = await Promise.all([
    fetchProfilePreferences(),
    fetchVehicles(true),
  ])

  const vehicles = all.filter((vehicle) => vehicle.archived_at === null)
  const closed = all.filter((vehicle) => vehicle.archived_at !== null)

  if (vehicles.length === 0 && closed.length === 0) redirect('/garage/new')

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

      {/* Sold and archived cars are out of the garage, not out of the app. A
          car whose whole log is preserved and whose page nothing links to is a
          car that has been deleted with extra steps. */}
      {closed.length > 0 ? (
        <section className="space-y-3">
          <h2 className="text-eyebrow font-display uppercase text-ink-muted">Closed chapters</h2>
          <ul className="overflow-hidden rounded-md border border-border bg-surface">
            {closed.map((vehicle, index) => (
              <li key={vehicle.id} className={index > 0 ? 'border-t border-border' : ''}>
                <Link
                  href={
                    (vehicle.status === 'sold'
                      ? `/garage/${vehicle.id}/sold`
                      : `/garage/${vehicle.id}`) as Route
                  }
                  className="flex min-h-touch items-center justify-between gap-4 px-4 py-3"
                >
                  <span className="min-w-0 truncate text-body text-ink">{vehicle.nickname}</span>
                  <span className="shrink-0 text-caption text-ink-muted">
                    {vehicle.status === 'sold'
                      ? `Sold${vehicle.sold_date ? ` ${dateLabel(vehicle.sold_date)}` : ''}`
                      : 'Archived'}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  )
}
