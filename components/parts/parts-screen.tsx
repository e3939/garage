// A grouped list and two sheets. All of it is open/closed state.
'use client'

import dynamic from 'next/dynamic'
import { useMemo, useState, type ReactNode } from 'react'

import { refitPartAction } from '@/app/(app)/parts/actions'
import { Button } from '@/components/ui/button'
import { Fab } from '@/components/ui/fab'
import { Money } from '@/components/ui/money'
import { Sheet } from '@/components/ui/sheet'
import { useToast } from '@/components/ui/toast'
import type { IsoDate } from '@/lib/dates'
import type { CategoryOption } from '@/lib/expenses/types'
import {
  PART_STATUSES,
  PART_STATUS_DESCRIPTION,
  PART_STATUS_LABEL,
  netCost,
  warrantyState,
  type ExpenseOption,
  type ModOption,
  type Part,
} from '@/lib/parts/types'

/** Both sheets arrive on the tap that opens them. See `service-screen.tsx`. */
const SHEET_SKELETON = () => <div className="min-h-0 flex-1 bg-surface-sunken" />

const PartSheet = dynamic(
  () => import('@/components/parts/part-sheet').then((module) => module.PartSheet),
  { ssr: false, loading: SHEET_SKELETON },
)

const RemovePartSheet = dynamic(
  () => import('@/components/parts/remove-part-sheet').then((module) => module.RemovePartSheet),
  { ssr: false, loading: SHEET_SKELETON },
)

export type PartsScreenProps = {
  vehicleId: string
  userId: string
  parts: readonly Part[]
  expenses: readonly ExpenseOption[]
  mods: readonly ModOption[]
  categories: readonly CategoryOption[]
  icons: Record<string, ReactNode>
  addIcon: ReactNode
  partIcon: ReactNode
  currency: string
  locale: string
  today: IsoDate
  dateLabels: Record<string, string>
}

type OpenSheet =
  | { kind: 'part'; item: Part | null }
  | { kind: 'remove'; item: Part }
  | null

/**
 * The inventory, grouped by status (docs/01-PRODUCT.md, section F).
 *
 * The order of the groups is the order things happen to a part: on the car, on
 * the shelf, sold, binned. An empty group is not drawn — a heading with nothing
 * under it is a question the screen is asking rather than answering.
 *
 * Each row carries what the part net cost, because that is the figure the whole
 * sell flow exists to keep honest, and a part that sold for more than half of
 * what it cost is a different object than one that was binned.
 */
export function PartsScreen({
  vehicleId,
  userId,
  parts,
  expenses,
  mods,
  categories,
  icons,
  addIcon,
  partIcon,
  currency,
  locale,
  today,
  dateLabels,
}: PartsScreenProps) {
  const [open, setOpen] = useState<OpenSheet>(null)
  const toast = useToast()

  const grouped = useMemo(
    () => PART_STATUSES.map((status) => ({ status, items: parts.filter((part) => part.status === status) })),
    [parts],
  )

  return (
    <div className="space-y-6">
      {parts.length === 0 ? (
        <p className="text-body text-ink-muted">
          Nothing in the inventory yet. Add a part and it lands on the car; take it off later and
          the app asks what became of it.
        </p>
      ) : null}

      {grouped.map(({ status, items }) =>
        items.length === 0 ? null : (
          <section key={status} className="space-y-3">
            <div>
              <h2 className="text-eyebrow font-display uppercase text-ink-muted">
                {`${PART_STATUS_LABEL[status]} · ${items.length}`}
              </h2>
              <p className="text-caption text-ink-faint">{PART_STATUS_DESCRIPTION[status]}</p>
            </div>

            <ul className="overflow-hidden rounded-md border border-border bg-surface">
              {items.map((part) => {
                const net = netCost(part)
                const warranty = warrantyState(part, today)

                return (
                  <li key={part.id} className="border-b border-border last:border-b-0">
                    <div className="flex items-start gap-3 px-3 py-3">
                      <span className="mt-1 text-ink-faint">{partIcon}</span>

                      <button
                        type="button"
                        onClick={() => setOpen({ kind: 'part', item: part })}
                        className="min-w-0 flex-1 text-left"
                      >
                        <p className="truncate text-body text-ink">{part.name}</p>
                        {/* Structured fields only. The notes and the photographs
                            are behind the tap (docs/03-DESIGN.md). */}
                        <p className="truncate text-caption text-ink-muted">
                          {[
                            part.brand,
                            part.part_number,
                            part.mod_title,
                            warranty === 'live' && part.warranty_until
                              ? `warranty to ${dateLabels[part.warranty_until] ?? part.warranty_until}`
                              : null,
                          ]
                            .filter(Boolean)
                            .join(' · ') || 'No details yet'}
                        </p>
                      </button>

                      <div className="flex shrink-0 flex-col items-end gap-1">
                        {net === null ? null : (
                          <Money
                            amount={net}
                            currency={part.currency ?? currency}
                            locale={locale}
                            size="label"
                          />
                        )}
                        {status === 'on_car' ? (
                          <Button size="sm" onClick={() => setOpen({ kind: 'remove', item: part })}>
                            Take off
                          </Button>
                        ) : status === 'shelf' ? (
                          <button
                            type="button"
                            className="text-caption text-accent"
                            onClick={() => {
                              void refitPartAction(part.id).then((result) => {
                                toast.show(result.ok ? `${part.name} back on the car` : result.error)
                              })
                            }}
                          >
                            Put it back on
                          </button>
                        ) : null}
                      </div>
                    </div>
                  </li>
                )
              })}
            </ul>
          </section>
        ),
      )}

      <Fab label="Add a part" onClick={() => setOpen({ kind: 'part', item: null })}>
        {addIcon}
      </Fab>

      <Sheet
        open={open?.kind === 'part'}
        onClose={() => setOpen(null)}
        title={open?.kind === 'part' && open.item ? open.item.name : 'Add a part'}
      >
        {open?.kind === 'part' ? (
          <PartSheet
            mode={open.item ? 'edit' : 'create'}
            vehicleId={vehicleId}
            userId={userId}
            initial={open.item}
            expenses={expenses}
            mods={mods}
            categories={categories}
            icons={icons}
            currency={currency}
            locale={locale}
            today={today}
            dateLabels={dateLabels}
            onDone={() => setOpen(null)}
          />
        ) : null}
      </Sheet>

      <Sheet
        open={open?.kind === 'remove'}
        onClose={() => setOpen(null)}
        title={open?.kind === 'remove' ? `Take off ${open.item.name}` : 'Take off'}
      >
        {open?.kind === 'remove' ? (
          <RemovePartSheet
            part={open.item}
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
