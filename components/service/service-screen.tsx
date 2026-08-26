// The schedule, the history and three sheets. All of it is open/closed state.
'use client'

import dynamic from 'next/dynamic'
import { useState, type ReactNode } from 'react'

import { deleteServiceRecordAction } from '@/app/(app)/service/actions'
import { Button } from '@/components/ui/button'
import { Fab } from '@/components/ui/fab'
import { Money } from '@/components/ui/money'
import { Sheet } from '@/components/ui/sheet'
import { useToast } from '@/components/ui/toast'
import type { IsoDate } from '@/lib/dates'
import type { CategoryOption } from '@/lib/expenses/types'
import {
  SERVICE_STATE_LABEL,
  dueSummary,
  intervalLabel,
  type ServiceDue,
  type ServiceRecord,
} from '@/lib/service/types'
import type { ServiceIcons } from '@/components/service/service-icons'

export type ServiceScreenProps = {
  vehicleId: string
  userId: string
  schedule: readonly ServiceDue[]
  history: readonly ServiceRecord[]
  /** Gauges, drawn on the server so no Phosphor or SVG maths reaches the client. */
  gauges: Record<string, ReactNode>
  icons: ServiceIcons
  categories: readonly CategoryOption[]
  categoryIcons: Record<string, ReactNode>
  lastReading: number
  currency: string
  locale: string
  today: IsoDate
  /** Dates in words, formatted on the server. See `lib/dates-display.ts`. */
  dateLabels: Record<string, string>
}

/**
 * Both sheets arrive on the tap that opens them, the way the mod board's
 * expense form does.
 *
 * A screen's own sheet is by definition not needed to read the screen, and here
 * it also keeps this route's client graph small enough that Turbopack does not
 * start grouping it with the expense form on the routes that carry the
 * quick-add FAB. See AUTOPILOT-NOTES.md.
 */
const SHEET_SKELETON = () => <div className="min-h-0 flex-1 bg-surface-sunken" />

const ScheduleSheet = dynamic(
  () => import('@/components/service/schedule-sheet').then((module) => module.ScheduleSheet),
  { ssr: false, loading: SHEET_SKELETON },
)

const MarkDoneSheet = dynamic(
  () => import('@/components/service/mark-done-sheet').then((module) => module.MarkDoneSheet),
  { ssr: false, loading: SHEET_SKELETON },
)

type OpenSheet =
  | { kind: 'schedule'; item: ServiceDue | null }
  | { kind: 'done'; item: ServiceDue | null }
  | null

/**
 * The service book: what is coming, and what has been done.
 *
 * The schedule is ordered by the view — most pressing first — and each row is
 * one tap to mark done and one tap on the name to edit the interval. Both of
 * those are things you do standing next to the car, so both are buttons rather
 * than a menu.
 *
 * Nothing here nags. An overdue item is the same row in the same place with a
 * different colour on its arc; there is no banner, no badge and no red at the
 * top of the screen (docs/01-PRODUCT.md).
 */
export function ServiceScreen({
  vehicleId,
  userId,
  schedule,
  history,
  gauges,
  icons,
  categories,
  categoryIcons,
  lastReading,
  currency,
  locale,
  today,
  dateLabels,
}: ServiceScreenProps) {
  const [open, setOpen] = useState<OpenSheet>(null)
  const toast = useToast()

  return (
    <div className="space-y-6">
      <section className="space-y-3">
        <h2 className="text-eyebrow font-display uppercase text-ink-muted">Schedule</h2>

        {schedule.length === 0 ? (
          <p className="text-body text-ink-muted">
            The schedule is empty. Add an item and it starts counting down from the reading on the
            clock.
          </p>
        ) : (
          <ul className="overflow-hidden rounded-md border border-border bg-surface">
            {schedule.map((item) => (
              <li key={item.schedule_id} className="border-b border-border last:border-b-0">
                <div className="flex items-center gap-3 px-3 py-3">
                  {gauges[item.schedule_id] ?? null}

                  <button
                    type="button"
                    onClick={() => setOpen({ kind: 'schedule', item })}
                    className="min-w-0 flex-1 text-left"
                  >
                    <p className="truncate text-title text-ink">{item.name}</p>
                    <p className="text-caption text-ink-muted">{dueSummary(item, locale)}</p>
                    <p className="text-caption text-ink-faint">
                      {intervalLabel(item, locale)}
                      {item.basis === 'purchase' ? ' · estimated from purchase' : ''}
                    </p>
                  </button>

                  <Button size="sm" onClick={() => setOpen({ kind: 'done', item })}>
                    Mark done
                  </Button>
                </div>
                <p className="sr-only">{SERVICE_STATE_LABEL[item.state]}</p>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="space-y-3">
        <h2 className="text-eyebrow font-display uppercase text-ink-muted">History</h2>

        {history.length === 0 ? (
          <p className="text-body text-ink-muted">
            Nothing logged yet. Marking a schedule item done writes the first entry.
          </p>
        ) : (
          <ul className="overflow-hidden rounded-md border border-border bg-surface">
            {history.map((record) => (
              <li
                key={record.id}
                className="flex items-start gap-3 border-b border-border px-3 py-3 last:border-b-0"
              >
                <span className="mt-1 text-ink-faint">{icons.service}</span>

                <div className="min-w-0 flex-1">
                  <p className="truncate text-body text-ink">{record.name}</p>
                  {/* Structured fields only, per docs/03-DESIGN.md. The notes and
                      the photographs live behind the tap, not on the line. */}
                  <p className="flex items-center gap-1 truncate text-caption text-ink-muted">
                    <span>{dateLabels[record.performed_on] ?? record.performed_on}</span>
                    {record.odometer_km !== null ? (
                      <span>{` · ${record.odometer_km.toLocaleString(locale)} km`}</span>
                    ) : null}
                    {record.workshop ? <span>{` · ${record.workshop}`}</span> : null}
                    {record.notes ? (
                      <span className="text-ink-faint">
                        {icons.note}
                        <span className="sr-only">Has a note</span>
                      </span>
                    ) : null}
                    {record.photo_count > 0 ? (
                      <span className="text-ink-faint">
                        {icons.photo}
                        <span className="sr-only">Has photos</span>
                      </span>
                    ) : null}
                  </p>
                </div>

                <div className="flex shrink-0 flex-col items-end gap-1">
                  {record.amount !== null ? (
                    <Money
                      amount={record.amount}
                      currency={record.currency ?? currency}
                      locale={locale}
                      size="label"
                    />
                  ) : null}
                  <button
                    type="button"
                    className="text-caption text-critical"
                    onClick={() => {
                      void deleteServiceRecordAction(record.id).then((result) => {
                        toast.show(
                          result.ok ? `${record.name} removed from the history` : result.error,
                        )
                      })
                    }}
                  >
                    Remove
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <div className="flex gap-2">
        <Button className="flex-1" onClick={() => setOpen({ kind: 'done', item: null })}>
          Log one-off work
        </Button>
      </div>

      <Fab label="Add a schedule item" onClick={() => setOpen({ kind: 'schedule', item: null })}>
        {icons.add}
      </Fab>

      <Sheet
        open={open?.kind === 'schedule'}
        onClose={() => setOpen(null)}
        title={open?.kind === 'schedule' && open.item ? open.item.name : 'Add a service item'}
      >
        {open?.kind === 'schedule' ? (
          <ScheduleSheet
            mode={open.item ? 'edit' : 'create'}
            vehicleId={vehicleId}
            locale={locale}
            initial={open.item}
            onDone={() => setOpen(null)}
          />
        ) : null}
      </Sheet>

      <Sheet
        open={open?.kind === 'done'}
        onClose={() => setOpen(null)}
        title={open?.kind === 'done' && open.item ? open.item.name : 'Log work'}
      >
        {open?.kind === 'done' ? (
          <MarkDoneSheet
            vehicleId={vehicleId}
            userId={userId}
            schedule={open.item}
            lastReading={lastReading}
            categories={categories}
            icons={categoryIcons}
            currency={currency}
            locale={locale}
            today={today}
            onDone={() => setOpen(null)}
          />
        ) : null}
      </Sheet>
    </div>
  )
}
