// Expanding is state, and the row lives inside the client-side feed.
'use client'

import type { ReactNode } from 'react'

import { Money } from '@/components/ui/money'
import type { TimelineRow } from '@/lib/timeline/types'

type FuelGroupProps = {
  row: TimelineRow
  icon: ReactNode
  locale: string
}

/**
 * A month of fill-ups, collapsed into one row.
 *
 * docs/01-PRODUCT.md is explicit: fuel is "collapsed - grouped as 4 fill-ups,
 * 1,240,000 dong - unless expanded". A tank of petrol is not an event in the
 * story of a car, and a feed that puts four of them between you and the day you
 * fitted the coilovers is a feed nobody scrolls twice.
 *
 * The grouping is done by `timeline_page` before the keyset is applied, so a
 * month is one row wherever the page boundary falls, and the individual fills
 * travel with it — expanding costs no round trip.
 */
export function FuelGroup({ row, icon, locale }: FuelGroupProps) {
  const showAmount = row.amount !== null && row.currency !== null

  return (
    <details className="feed-row border-b border-border last:border-b-0">
      <summary className="flex cursor-pointer list-none items-center gap-3 px-4 py-3 marker:content-none">
        <span
          aria-hidden
          className="flex size-8 shrink-0 items-center justify-center rounded-full bg-surface-sunken text-ink-muted"
        >
          {icon}
        </span>

        <span className="min-w-0 flex-1">
          <span className="block truncate text-body text-ink">{row.title}</span>
          <span className="block text-caption text-ink-muted">Tap to see each fill</span>
        </span>

        {showAmount ? (
          <Money
            amount={row.amount as number}
            currency={row.currency ?? undefined}
            locale={locale}
            size="odometer"
            className="text-ink"
          />
        ) : null}
      </summary>

      <ul className="border-t border-border bg-surface-sunken">
        {row.items.map((fill) => (
          <li
            key={fill.ref_id}
            className="flex items-center gap-3 border-b border-border px-4 py-2 pl-[60px] last:border-b-0"
          >
            <span className="min-w-0 flex-1">
              <span className="block truncate text-caption text-ink">{fill.title}</span>
              <span className="block truncate text-caption text-ink-muted">
                {[fill.date_label, fill.subtitle].filter(Boolean).join(' · ')}
              </span>
            </span>
            {fill.amount === null ? null : (
              <Money
                amount={fill.amount}
                currency={row.currency ?? undefined}
                locale={locale}
                size="label"
                className="text-ink-muted"
              />
            )}
          </li>
        ))}
      </ul>
    </details>
  )
}
