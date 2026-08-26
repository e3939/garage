import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import type { ReactNode } from 'react'

import { categoryIconMap } from '@/components/expenses/category-icons'
import { DueGauge } from '@/components/service/due-gauge'
import { serviceIcons } from '@/components/service/service-icons'
import { ServiceScreen } from '@/components/service/service-screen'
import { todayIso } from '@/lib/dates'
import { dateLabel } from '@/lib/dates-display'
import { fetchRankedCategories } from '@/lib/queries/categories'
import { fetchProfilePreferences, fetchUserId } from '@/lib/queries/profile'
import { fetchServiceDue, fetchServiceRecords } from '@/lib/queries/service'
import { fetchVehicle } from '@/lib/queries/vehicles'
import { SERVICE_STATE_LABEL } from '@/lib/service/types'

export const metadata: Metadata = { title: 'Service' }

type ServicePageProps = {
  params: Promise<{ vehicleId: string }>
}

/**
 * The schedule and the history (docs/01-PRODUCT.md, section D).
 *
 * Every due figure is computed by `v_service_due`; nothing on this page is
 * reduced in the browser. The gauges and the dates in words are both drawn on
 * the server — the arcs because an SVG costs no JavaScript at all, and the dates
 * because a locale's month names are eight kilobytes and this screen has the
 * server's copy already (`lib/dates-display.ts`).
 */
export default async function ServicePage({ params }: ServicePageProps) {
  const { vehicleId } = await params

  const [preferences, vehicle] = await Promise.all([
    fetchProfilePreferences(),
    fetchVehicle(vehicleId),
  ])
  if (!vehicle) notFound()

  const [schedule, history, categories, userId] = await Promise.all([
    fetchServiceDue(vehicle.id),
    fetchServiceRecords(vehicle.id),
    fetchRankedCategories(),
    fetchUserId(),
  ])

  const gauges: Record<string, ReactNode> = {}
  for (const item of schedule) {
    gauges[item.schedule_id] = (
      <DueGauge
        due={item}
        size={48}
        label={`${item.name}: ${SERVICE_STATE_LABEL[item.state]}`}
      />
    )
  }

  const dateLabels: Record<string, string> = {}
  for (const record of history) {
    dateLabels[record.performed_on] ??= dateLabel(record.performed_on)
  }

  return (
    <ServiceScreen
      vehicleId={vehicle.id}
      userId={userId ?? ''}
      schedule={schedule}
      history={history}
      gauges={gauges}
      icons={serviceIcons()}
      categories={categories}
      categoryIcons={categoryIconMap(categories)}
      lastReading={vehicle.odometer_km}
      currency={preferences.baseCurrency}
      locale={preferences.locale}
      today={todayIso()}
      dateLabels={dateLabels}
    />
  )
}
