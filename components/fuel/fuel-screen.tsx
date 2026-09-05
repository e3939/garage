// The log, and the sheet that edits a row of it.
'use client'

import dynamic from 'next/dynamic'
import { useState, type ReactNode } from 'react'

import { GasPump } from '@/components/icons'
import { Button } from '@/components/ui/button'
import { EmptyState } from '@/components/ui/empty-state'
import { Fab } from '@/components/ui/fab'
import { Money } from '@/components/ui/money'
import { Sheet } from '@/components/ui/sheet'
import type { IsoDate } from '@/lib/dates'
import type { CategoryOption } from '@/lib/expenses/types'
import type { ConsumptionInterval } from '@/lib/fuel/consumption'
import type { FuelLog } from '@/lib/fuel/types'

/**
 * docs/03-DESIGN.md: fixed-height rows. CLAUDE.md section 3 asks for lists over
 * forty rows to be virtualised, and this one is capped at a hundred and twenty —
 * ten years of monthly fill-ups. It is done with `content-visibility: auto`
 * rather than the ledger's `<VirtualList>`, which is the same choice the build
 * log made and for a second reason besides: importing that component here puts
 * it in a second client entry graph, and Turbopack answers by emitting the
 * expense form twice and charging /today and /ledger 8.4KB each for a screen
 * neither of them opens. The browser skips layout for off-screen rows for
 * nothing. See AUTOPILOT-NOTES.md.
 */
const ROW_HEIGHT = 64

/** The form arrives on the tap that opens it. See `service-screen.tsx`. */
const FuelForm = dynamic(
  () => import('@/components/fuel/fuel-form').then((module) => module.FuelForm),
  { ssr: false, loading: () => <div className="min-h-0 flex-1 bg-surface-sunken" /> },
)

export type FuelScreenProps = {
  vehicleId: string
  userId: string
  logs: readonly FuelLog[]
  /** Keyed by the fill that closed each interval, so a row can carry its figure. */
  consumption: Record<string, ConsumptionInterval>
  lastReading: number
  categories: readonly CategoryOption[]
  addIcon: ReactNode
  currency: string
  locale: string
  today: IsoDate
  dateLabels: Record<string, string>
}

/**
 * The fill-up log.
 *
 * Each row carries the consumption figure of the interval it closed, which is
 * the one number a fill-up earns rather than merely records. A partial fill has
 * none and says why in the same slot, so the gap in the column is explained
 * rather than looking like a missing value.
 */
export function FuelScreen({
  vehicleId,
  userId,
  logs,
  consumption,
  lastReading,
  categories,
  addIcon,
  currency,
  locale,
  today,
  dateLabels,
}: FuelScreenProps) {
  const [open, setOpen] = useState<FuelLog | null | 'new'>(null)

  return (
    <>
      {logs.length === 0 ? (
        <EmptyState
          icon={GasPump}
          action={
            <Button variant="primary" onClick={() => setOpen('new')}>
              Add fill-up
            </Button>
          }
        >
          No fuel logged yet. Add your first fill-up to start tracking consumption.
        </EmptyState>
      ) : (
        <ul className="overflow-hidden rounded-md border border-border bg-surface">
          {logs.map((log) => {
            const interval = consumption[log.id]
            return (
              <li key={log.id} className="log-row">
                <button
                  type="button"
                  onClick={() => setOpen(log)}
                  style={{ height: ROW_HEIGHT }}
                  className="flex w-full items-center gap-3 border-b border-border px-3 text-left"
                >
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-body text-ink">
                      {log.station ?? (log.is_full_tank ? 'Full tank' : 'Part fill')}
                    </p>
                    {/* Structured fields only, per docs/03-DESIGN.md's rule for
                        any fixed-height row that summarises a record. */}
                    <p className="truncate text-caption text-ink-muted">
                      {`${dateLabels[log.filled_on] ?? log.filled_on} · ${log.litres} L · ${log.odometer_km.toLocaleString(locale)} km`}
                    </p>
                  </div>

                  <div className="shrink-0 text-right">
                    <Money amount={log.total_cost} currency={log.currency} locale={locale} size="label" />
                    {/* What this fill-up earned, not merely what it recorded. A
                        fill with no figure says why, so the gap in the column is
                        explained rather than looking like a missing value. */}
                    <p className="font-mono text-caption text-ink-faint">
                      {interval
                        ? `${interval.l_per_100km} L/100km`
                        : log.missed_previous
                          ? 'chain broken'
                          : log.is_full_tank
                            ? 'no pair yet'
                            : 'part fill'}
                    </p>
                  </div>
                </button>
              </li>
            )
          })}
        </ul>
      )}

      <Fab label="Add a fill-up" onClick={() => setOpen('new')}>
        {addIcon}
      </Fab>

      <Sheet
        open={open !== null}
        onClose={() => setOpen(null)}
        title={open === 'new' || open === null ? 'Add fill-up' : 'Edit fill-up'}
      >
        {open !== null ? (
          <FuelForm
            mode={open === 'new' ? 'create' : 'edit'}
            vehicleId={vehicleId}
            userId={userId}
            initial={open === 'new' ? null : open}
            lastReading={lastReading}
            categories={categories}
            currency={currency}
            locale={locale}
            today={today}
            onDone={() => setOpen(null)}
          />
        ) : null}
      </Sheet>
    </>
  )
}
