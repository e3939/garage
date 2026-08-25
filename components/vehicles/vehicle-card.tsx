import type { Route } from 'next'
import Image from 'next/image'
import Link from 'next/link'

import { Car, ICON_UI } from '@/components/icons'
import { VehicleMonthTotal } from '@/components/vehicles/vehicle-month-total'
import type { IsoDate } from '@/lib/dates'
import { heroAlt, vehicleColour, vehicleSubtitle, type Vehicle } from '@/lib/vehicles/types'
import type { MonthViewTotals, SpendView } from '@/lib/views'

type VehicleCardProps = {
  vehicle: Vehicle
  heroUrl: string | null
  month: IsoDate
  monthTotals: MonthViewTotals
  view: SpendView
  currency: string
  locale: string
}

/**
 * One car in the garage. The whole card is the tap target — this is the vehicle
 * switcher as well as the list, and a switcher you have to aim at is a switcher
 * you avoid.
 *
 * The thumbnail keeps its 16:9 box whether or not there is an image in it, so a
 * garage of five cars does not reflow as their photos arrive.
 */
export function VehicleCard({
  vehicle,
  heroUrl,
  month,
  monthTotals,
  view,
  currency,
  locale,
}: VehicleCardProps) {
  const subtitle = vehicleSubtitle(vehicle)

  return (
    <Link
      href={`/garage/${vehicle.id}` as Route}
      className="block overflow-hidden rounded-md border border-border bg-surface"
    >
      <div className="flex items-center gap-3 p-3">
        <span
          className="relative w-20 shrink-0 overflow-hidden rounded-sm bg-surface-sunken"
          style={{ aspectRatio: '16 / 9' }}
        >
          {heroUrl ? (
            <Image
              src={heroUrl}
              alt={heroAlt(vehicle)}
              fill
              sizes="80px"
              className="object-cover"
            />
          ) : (
            <span className="absolute inset-0 flex items-center justify-center text-ink-faint">
              <Car {...ICON_UI} aria-hidden />
            </span>
          )}
        </span>

        <span className="min-w-0 flex-1">
          <span className="flex items-center gap-2">
            <span
              aria-hidden
              className="size-2 shrink-0 rounded-full"
              style={{ backgroundColor: vehicleColour(vehicle) }}
            />
            <span className="truncate font-display text-title text-ink">{vehicle.nickname}</span>
          </span>
          {subtitle ? (
            <span className="mt-1 block truncate text-caption text-ink-muted">{subtitle}</span>
          ) : null}
          <span className="mt-1 block font-mono text-caption text-ink-muted">
            {vehicle.odometer_km.toLocaleString(locale)} km
          </span>
        </span>
      </div>

      <div className="border-t border-border px-3 pb-3 pt-3">
        <VehicleMonthTotal
          vehicleId={vehicle.id}
          month={month}
          totals={monthTotals}
          view={view}
          currency={currency}
          locale={locale}
        />
      </div>
    </Link>
  )
}
