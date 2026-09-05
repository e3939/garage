import type { Metadata } from 'next'
import { notFound } from 'next/navigation'

import { ConsumptionChart } from '@/components/fuel/consumption-chart'
import { FuelScreen } from '@/components/fuel/fuel-screen'
import { FuelStats } from '@/components/fuel/fuel-stats'
import { Plus } from '@/components/icons'
import { todayIso } from '@/lib/dates'
import { dateLabel } from '@/lib/dates-display'
import type { ConsumptionInterval } from '@/lib/fuel/consumption'
import { fetchRankedCategories } from '@/lib/queries/categories'
import { fetchFuelPage } from '@/lib/queries/fuel'
import { fetchProfilePreferences, fetchUserId } from '@/lib/queries/profile'
import { fetchVehicle } from '@/lib/queries/vehicles'

export const metadata: Metadata = { title: 'Fuel' }

type FuelPageProps = {
  params: Promise<{ vehicleId: string }>
}

/**
 * The fill-up log and the consumption chart (docs/01-PRODUCT.md, section E).
 *
 * Every consumption figure comes out of `v_fuel_consumption` and every headline
 * out of `v_fuel_summary`; nothing on this page is reduced in the browser
 * (CLAUDE.md section 3). The chart is an SVG drawn on the server, so a screen
 * whose whole job is one line and some dots costs no charting library — see
 * `components/fuel/consumption-chart.tsx` for why that diverges from the stack
 * table in CLAUDE.md, and AUTOPILOT-NOTES.md for the record of it.
 */
export default async function FuelPage({ params }: FuelPageProps) {
  const { vehicleId } = await params

  const [preferences, vehicle] = await Promise.all([
    fetchProfilePreferences(),
    fetchVehicle(vehicleId),
  ])
  if (!vehicle) notFound()

  const [page, categories, userId] = await Promise.all([
    fetchFuelPage(vehicle.id, preferences.baseCurrency),
    fetchRankedCategories(),
    fetchUserId(),
  ])

  const consumption: Record<string, ConsumptionInterval> = {}
  for (const interval of page.intervals) consumption[interval.end_fuel_log_id] = interval

  // Dates in words are formatted here, once per distinct day, for the reason in
  // `lib/dates-display.ts`: a locale's month names are eight kilobytes gzipped
  // and the server already has them.
  const dateLabels: Record<string, string> = {}
  for (const log of page.logs) dateLabels[log.filled_on] ??= dateLabel(log.filled_on)
  for (const interval of page.intervals) dateLabels[interval.ended_on] ??= dateLabel(interval.ended_on)
  for (const marker of page.markers) dateLabels[marker.installed_on] ??= dateLabel(marker.installed_on)

  return (
    <div className="space-y-6">
      <FuelStats summary={page.summary} locale={preferences.locale} />

      <ConsumptionChart
        intervals={page.intervals}
        markers={page.markers}
        dateLabels={dateLabels}
      />

      <section className="space-y-3">
        <h2 className="text-eyebrow font-display uppercase text-ink-muted">Fill-ups</h2>
        <FuelScreen
          vehicleId={vehicle.id}
          userId={userId ?? ''}
          logs={page.logs}
          consumption={consumption}
          lastReading={vehicle.odometer_km}
          categories={categories}
          addIcon={<Plus size={24} weight="bold" aria-hidden />}
          currency={preferences.baseCurrency}
          locale={preferences.locale}
          today={todayIso()}
          dateLabels={dateLabels}
        />
      </section>
    </div>
  )
}
