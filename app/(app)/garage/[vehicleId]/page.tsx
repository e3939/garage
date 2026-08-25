import type { Metadata } from 'next'
import type { Route } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'

import { timelineKindIcons } from '@/components/timeline/kind-icons'
import { TimelineFeed } from '@/components/timeline/timeline-feed'
import { Total } from '@/components/totals/total'
import { ViewSwitcher } from '@/components/totals/view-switcher'
import { ServicePanel } from '@/components/vehicles/service-panel'
import { VehicleHero } from '@/components/vehicles/vehicle-hero'
import { VehicleMonthTotal } from '@/components/vehicles/vehicle-month-total'
import { monthStart, todayIso } from '@/lib/dates'
import { monthLabel } from '@/lib/dates-display'
import type { RawSearchParams } from '@/lib/expenses/filters'
import { fetchProfilePreferences, fetchUserId } from '@/lib/queries/profile'
import { fetchTimelinePage } from '@/lib/queries/timeline'
import { fetchVehicle, fetchVehicleMonthTotals, fetchVehicleTotals } from '@/lib/queries/vehicles'
import { signedUrl } from '@/lib/storage/signed-url'
import { parseSpendView, SPEND_VIEW_PARAM } from '@/lib/views'

export const metadata: Metadata = { title: 'Vehicle' }

type VehiclePageProps = {
  params: Promise<{ vehicleId: string }>
  searchParams: Promise<RawSearchParams>
}

function firstParam(value: string | string[] | undefined): string | null {
  if (Array.isArray(value)) return value[0] ?? null
  return value ?? null
}

/**
 * Vehicle home: the photo, the spec strip, and four live numbers
 * (docs/01-PRODUCT.md, section B).
 *
 * Two of the four are lifetime figures and do not move with the switcher, and
 * their labels say so. "Cash-out views and lifetime totals always use the full
 * amount on the purchase date" — amortising a lifetime total would be
 * meaningless, and a figure that silently ignored the control above it would be
 * worse than one that names the view it is showing. The third figure is the
 * month, and it responds to all three views. The fourth is the service schedule,
 * which is Phase 6.
 *
 * Every figure is computed by `v_vehicle_totals` or `v_vehicle_month_totals`.
 * Nothing on this page is reduced in the browser.
 */
export default async function VehiclePage({ params, searchParams }: VehiclePageProps) {
  const { vehicleId } = await params
  const raw = await searchParams

  const [preferences, vehicle] = await Promise.all([
    fetchProfilePreferences(),
    fetchVehicle(vehicleId),
  ])

  if (!vehicle) notFound()

  const view = parseSpendView(firstParam(raw[SPEND_VIEW_PARAM]), preferences.defaultView)
  const month = monthStart(todayIso())

  const [totals, monthTotals, heroUrl, timeline, userId] = await Promise.all([
    fetchVehicleTotals(vehicle.id, preferences.baseCurrency),
    fetchVehicleMonthTotals(vehicle.id, month, preferences.baseCurrency),
    signedUrl('vehicles', vehicle.hero_photo_path),
    fetchTimelinePage(vehicle.id),
    fetchUserId(),
  ])

  const search = new URLSearchParams()
  for (const [key, value] of Object.entries(raw)) {
    if (key === SPEND_VIEW_PARAM) continue
    const single = firstParam(value)
    if (single !== null) search.set(key, single)
  }

  const kmDriven = totals.km_driven.toLocaleString(preferences.locale)

  return (
    <div className="space-y-6">
      <VehicleHero vehicle={vehicle} heroUrl={heroUrl} locale={preferences.locale} />

      <ViewSwitcher view={view} search={search.toString()} />

      <Total
        name="Total invested"
        view="All-in"
        context="Lifetime"
        emphasis="hero"
        amount={totals.total_invested}
        currency={totals.currency}
        locale={preferences.locale}
        caption="Purchase price plus every car expense, at full amount on the day it was paid."
      />

      <div className="grid grid-cols-2 gap-3">
        <Total
          name="Cost per km"
          view="All-in"
          context="Since purchase"
          amount={totals.cost_per_km}
          currency={totals.currency}
          locale={preferences.locale}
          suffix="/km"
          caption={
            totals.km_driven > 0
              ? `${kmDriven} km driven`
              : 'No kilometres recorded since purchase yet.'
          }
        />

        <VehicleMonthTotal
          vehicleId={vehicle.id}
          month={month}
          monthContext={monthLabel(month)}
          totals={monthTotals}
          view={view}
          currency={preferences.baseCurrency}
          locale={preferences.locale}
        />
      </div>

      <ServicePanel />

      <nav aria-label="This vehicle">
        <ul className="overflow-hidden rounded-md border border-border bg-surface">
          <li>
            <Link
              href={`/ledger?veh=${vehicle.id}` as Route}
              className="flex min-h-touch items-center justify-between gap-4 px-4 py-3"
            >
              <span className="text-body text-ink">Expenses</span>
              <span className="text-caption text-ink-muted">Every row for this car</span>
            </Link>
          </li>
          <li className="border-t border-border">
            <Link
              href={`/garage/${vehicle.id}/edit` as Route}
              className="flex min-h-touch items-center justify-between gap-4 px-4 py-3"
            >
              <span className="text-body text-ink">Edit vehicle</span>
              <span className="text-caption text-ink-muted">Spec, photo, odometer</span>
            </Link>
          </li>
        </ul>
      </nav>

      <section className="space-y-3">
        <h2 className="text-eyebrow font-display uppercase text-ink-muted">Build log</h2>
        <TimelineFeed
          vehicleId={vehicle.id}
          page={timeline}
          icons={timelineKindIcons()}
          locale={preferences.locale}
          today={todayIso()}
          userId={userId ?? ''}
          lastReading={vehicle.odometer_km}
        />
      </section>

      <p className="text-caption text-ink-muted">
        The mod board arrives in Phase 5, and service, fuel and parts in Phase 6.
      </p>
    </div>
  )
}
