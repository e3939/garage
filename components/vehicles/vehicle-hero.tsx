import Image from 'next/image'

import { Car, ICON_EMPTY } from '@/components/icons'
import { DISPLAY_QUALITY } from '@/lib/images/budgets'
import { dateLabel } from '@/lib/dates-display'
import { heroAlt, specStripParts, vehicleColour, type Vehicle } from '@/lib/vehicles/types'

type VehicleHeroProps = {
  vehicle: Vehicle
  /** A signed URL from the cached helper, or null when there is no photo. */
  heroUrl: string | null
  locale: string
}

/**
 * The photo, the spec strip and the odometer.
 *
 * The frame is 16:9 whether or not there is an image in it and the image is
 * `fill` with an explicit `sizes`, so nothing on the page moves when it loads
 * (CLAUDE.md section 3). `priority` is set because on this screen the hero is
 * the largest contentful paint by definition.
 *
 * `quality` is raised above Next's default 75 because the source is already a
 * compressed WebP and re-encoding it at 75 is a second lossy pass — generation
 * loss shows worst in flat areas of colour, which on a photo of a car is the
 * paint. See lib/images/budgets.ts.
 *
 * A field nobody filled in is left out of the strip rather than shown as a dash.
 * An empty slot in a spec strip reads as a fault in the car; a shorter strip
 * reads as a shorter strip.
 */
export function VehicleHero({ vehicle, heroUrl, locale }: VehicleHeroProps) {
  const spec = specStripParts(vehicle)

  return (
    <section className="overflow-hidden rounded-md border border-border bg-surface">
      <div className="relative w-full bg-surface-sunken" style={{ aspectRatio: '16 / 9' }}>
        {heroUrl ? (
          <Image
            src={heroUrl}
            alt={heroAlt(vehicle)}
            fill
            priority
            sizes="(min-width: 640px) 640px, 100vw"
            quality={DISPLAY_QUALITY}
            className="object-cover"
          />
        ) : (
          <span className="absolute inset-0 flex flex-col items-center justify-center gap-2 px-4 text-center">
            <Car {...ICON_EMPTY} className="text-ink-faint" aria-hidden />
            <span className="text-caption text-ink-muted">
              No photo yet. Add one when you edit the vehicle.
            </span>
          </span>
        )}
      </div>

      <div className="space-y-2 px-4 py-3">
        <div className="flex items-center gap-2">
          <span
            aria-hidden
            className="size-3 shrink-0 rounded-full border border-border-strong"
            style={{ backgroundColor: vehicleColour(vehicle) }}
          />
          <p className="min-w-0 flex-1 truncate text-caption text-ink-muted">
            {spec.length > 0 ? spec.join(' · ') : 'No specification recorded yet.'}
          </p>
        </div>

        <div className="flex items-baseline justify-between gap-4">
          <span className="font-mono text-odometer text-ink">
            {vehicle.odometer_km.toLocaleString(locale)}
            <span className="text-label text-ink-muted"> km</span>
          </span>
          <span className="text-caption text-ink-faint">
            {vehicle.odometer_at
              ? `Last read ${dateLabel(vehicle.odometer_at)}`
              : 'Entered by hand'}
          </span>
        </div>

        {vehicle.plate ? (
          <p className="text-caption text-ink-muted">
            <span className="sr-only">Plate </span>
            {vehicle.plate}
          </p>
        ) : null}
      </div>
    </section>
  )
}
