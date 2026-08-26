import type { Metadata } from 'next'
import type { Route } from 'next'
import Image from 'next/image'
import Link from 'next/link'
import { notFound } from 'next/navigation'

import { Stamp } from '@/components/timeline/stamp'
import { Stat, Total } from '@/components/totals/total'
import { dateLabel } from '@/lib/dates-display'
import { fetchProfilePreferences } from '@/lib/queries/profile'
import { fetchVehicle, fetchVehicleClosing } from '@/lib/queries/vehicles'
import { signedUrl } from '@/lib/storage/signed-url'
import { heroAlt, specStripParts } from '@/lib/vehicles/types'

export const metadata: Metadata = { title: 'Closing summary' }

type SoldPageProps = { params: Promise<{ vehicleId: string }> }

/**
 * The closing summary. A page worth screenshotting.
 *
 * docs/01-PRODUCT.md, section B: "Selling a car doesn't delete it. It archives
 * into a closed chapter with a final summary: total owned cost, km driven, cost
 * per km, months owned, and the full log preserved."
 *
 * All five are here, plus the two figures a sale adds — what it went for, and
 * what it therefore cost to own. Every one of them comes out of
 * `v_vehicle_closing` in a single query; nothing on this page does arithmetic.
 *
 * It renders for a car that has not been sold too, showing the same figures with
 * the sale left out, because the page is the truth about a car rather than a
 * receipt for a transaction. Nothing here is destructive and nothing is a
 * button: it is a page to look at, and the only two links leave it.
 */
export default async function SoldPage({ params }: SoldPageProps) {
  const { vehicleId } = await params

  const [preferences, vehicle, closing] = await Promise.all([
    fetchProfilePreferences(),
    fetchVehicle(vehicleId),
    fetchVehicleClosing(vehicleId),
  ])

  if (!vehicle || !closing) notFound()

  const heroUrl = await signedUrl('vehicles', vehicle.hero_photo_path)
  const spec = specStripParts(vehicle)
  const sold = closing.status === 'sold'

  const number = (value: number) => value.toLocaleString(preferences.locale)

  const owned = [
    closing.purchase_date ? dateLabel(closing.purchase_date) : null,
    closing.sold_date ? dateLabel(closing.sold_date) : sold ? null : 'today',
  ].filter((part): part is string => part !== null)

  const months = closing.months_owned
  const monthsLine =
    months === null
      ? 'No purchase date recorded, so the clock never started.'
      : `${number(months)} ${months === 1 ? 'month' : 'months'}${owned.length === 2 ? `, ${owned[0]} to ${owned[1]}` : ''}`

  const log = [
    `${number(closing.expense_count)} ${closing.expense_count === 1 ? 'expense' : 'expenses'}`,
    `${number(closing.fill_ups)} ${closing.fill_ups === 1 ? 'fill-up' : 'fill-ups'}`,
    `${number(closing.services_done)} ${closing.services_done === 1 ? 'service' : 'services'}`,
  ].join(' · ')

  return (
    <div className="space-y-6">
      <section className="overflow-hidden rounded-md border border-border bg-surface">
        <div className="relative w-full bg-surface-sunken" style={{ aspectRatio: '16 / 9' }}>
          {heroUrl ? (
            <Image
              src={heroUrl}
              alt={heroAlt(vehicle)}
              fill
              priority
              sizes="(min-width: 640px) 640px, 100vw"
              className="object-cover"
            />
          ) : null}
          {sold ? (
            <span className="absolute right-3 top-3">
              <Stamp id={vehicle.id} size="lg">
                Sold
              </Stamp>
            </span>
          ) : null}
        </div>

        <div className="space-y-1 px-4 py-4">
          <h1 className="font-display text-title uppercase text-ink">{vehicle.nickname}</h1>
          <p className="text-caption text-ink-muted">
            {spec.length > 0 ? spec.join(' · ') : 'No specification recorded.'}
          </p>
          <p className="text-caption text-ink-faint">{monthsLine}</p>
        </div>
      </section>

      <Total
        name="Total owned cost"
        view="All-in"
        context="Lifetime"
        emphasis="hero"
        amount={closing.total_invested}
        currency={closing.currency}
        locale={preferences.locale}
        caption="The purchase price plus every expense this car earned, at full amount on the day it was paid."
      />

      <div className="grid grid-cols-2 gap-3">
        <Stat
          name="Kilometres driven"
          view="All-in"
          context="Since purchase"
          caption={
            closing.km_driven > 0
              ? 'Measured from the reading it was bought on.'
              : 'No kilometres recorded against this car.'
          }
        >
          <span className="font-mono text-odometer text-ink">
            {number(closing.km_driven)}
            <span className="text-label text-ink-muted"> km</span>
          </span>
        </Stat>

        <Total
          name="Cost per km"
          view="All-in"
          context="Since purchase"
          amount={closing.cost_per_km}
          currency={closing.currency}
          locale={preferences.locale}
          suffix="/km"
          caption="Everything it cost, over everything it covered."
        />

        <Stat
          name="Months owned"
          view="All-in"
          context={sold ? 'Purchase to sale' : 'Purchase to today'}
          caption={sold ? 'Measured to the day it was sold.' : 'Still running.'}
        >
          <span className="font-mono text-odometer text-ink">
            {months === null ? <span className="text-ink-faint">&mdash;</span> : number(months)}
          </span>
        </Stat>

        <Stat
          name="Mods installed"
          view="All-in"
          context="Lifetime"
          caption={
            closing.mods_installed === 0
              ? 'Nothing was fitted from the board.'
              : 'Moved to installed on the board.'
          }
        >
          <span className="font-mono text-odometer text-ink">{number(closing.mods_installed)}</span>
        </Stat>
      </div>

      {sold ? (
        <div className="grid grid-cols-2 gap-3">
          <Total
            name="Sold for"
            view="All-in"
            context={closing.sold_date ? dateLabel(closing.sold_date) : 'Sold'}
            amount={closing.sold_price}
            currency={closing.currency}
            locale={preferences.locale}
            caption={closing.sold_price === null ? 'No sale price recorded.' : undefined}
          />

          <Total
            name="Cost of ownership"
            view="All-in"
            context="Net of the sale"
            amount={closing.sold_price === null ? null : closing.net_cost}
            currency={closing.currency}
            locale={preferences.locale}
            caption={
              closing.sold_price === null
                ? 'Needs a sale price to work out.'
                : closing.net_cost < 0
                  ? 'It sold for more than it cost. That is rare, and it is real.'
                  : 'Everything put in, less what came back out.'
            }
          />
        </div>
      ) : null}

      {sold && closing.sold_price !== null && closing.net_cost_per_km !== null ? (
        <Total
          name="Cost per km, net of the sale"
          view="All-in"
          context="Since purchase"
          amount={closing.net_cost_per_km}
          currency={closing.currency}
          locale={preferences.locale}
          suffix="/km"
          caption="What each kilometre actually cost, once the car was sold on."
        />
      ) : null}

      <section className="space-y-2 rounded-md border border-border bg-surface p-4">
        <h2 className="text-label text-ink">The log is intact</h2>
        <p className="text-caption text-ink-muted">{log}. Nothing was deleted.</p>
        <div className="flex flex-wrap gap-2 pt-1">
          <Link
            href={`/garage/${vehicle.id}` as Route}
            className="inline-flex min-h-touch items-center justify-center rounded-md border border-border-strong bg-surface px-4 text-body text-ink"
          >
            Open the build log
          </Link>
          <Link
            href={`/ledger?veh=${vehicle.id}` as Route}
            className="inline-flex min-h-touch items-center justify-center rounded-md border border-border-strong bg-surface px-4 text-body text-ink"
          >
            Every expense
          </Link>
        </div>
      </section>
    </div>
  )
}
