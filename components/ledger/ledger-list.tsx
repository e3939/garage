// The list holds pages loaded after the first, the row being edited, and the
// optimistic view of both.
'use client'

import { useMemo, useRef, useState, type ReactNode } from 'react'

import {
  deleteExpenseAction,
  loadLedgerPageAction,
  restoreExpenseAction,
} from '@/app/(app)/expenses/actions'
import { loadAttachmentsAction } from '@/app/(app)/attachments/actions'
import { ExpenseForm } from '@/components/expenses/expense-form'
import { useExpenseStore } from '@/components/expenses/expense-store'
import { LedgerDayHeading, LedgerRowButton, LEDGER_DAY_HEIGHT, LEDGER_ROW_HEIGHT } from '@/components/ledger/ledger-row'
import type { LedgerSignalIcons } from '@/components/ledger/row-signals'
import { Button } from '@/components/ui/button'
import { Sheet } from '@/components/ui/sheet'
import { VirtualList } from '@/components/ui/virtual-list'
import { dayHeading } from '@/lib/dates-display'
import type { IsoDate } from '@/lib/dates'
import type { LedgerFilters } from '@/lib/expenses/filters'
import {
  applyPending,
  buildLedgerItems,
  writeFromLedgerRow,
  type LedgerItem,
  type OptimisticRow,
} from '@/lib/expenses/optimistic'
import type { CategoryOption, LedgerCursor, LedgerRow, VehicleOption } from '@/lib/expenses/types'
import type { LedgerPage } from '@/lib/queries/expenses'
import type { AttachmentView } from '@/lib/attachments/types'

/** Hoisted so the offset table inside VirtualList is not rebuilt every render. */
function ledgerItemHeight(item: LedgerItem): number {
  return item.kind === 'day' ? LEDGER_DAY_HEIGHT : LEDGER_ROW_HEIGHT
}

type LedgerListProps = {
  page: LedgerPage
  filters: LedgerFilters
  categories: readonly CategoryOption[]
  icons: Record<string, ReactNode>
  /** The note and attachment glyphs, drawn on the server like the icons above. */
  signals: LedgerSignalIcons
  vehicles: readonly VehicleOption[]
  currency: string
  locale: string
  amortiseThreshold: number | null
  today: IsoDate
  /** Whose storage folder new uploads go into. From the session on the server. */
  userId: string
}

type Loaded = {
  /** The server page these extras were loaded on top of. */
  seed: LedgerPage
  extra: LedgerRow[]
  cursor: LedgerCursor | null
  hasMore: boolean
}

function seedState(page: LedgerPage): Loaded {
  return { seed: page, extra: [], cursor: page.cursor, hasMore: page.hasMore }
}

export function LedgerList({
  page,
  filters,
  categories,
  icons,
  signals,
  vehicles,
  currency,
  locale,
  amortiseThreshold,
  today,
  userId,
}: LedgerListProps) {
  const store = useExpenseStore()
  const [loaded, setLoaded] = useState<Loaded>(() => seedState(page))
  const [loading, setLoading] = useState(false)
  const [editing, setEditing] = useState<OptimisticRow | null>(null)
  /**
   * The photos on the row being edited, fetched when the sheet opens rather than
   * sent with every row of the page. A page is forty rows and one of them gets
   * tapped.
   */
  const [photos, setPhotos] = useState<AttachmentView[]>([])
  const [photosFor, setPhotosFor] = useState<string | null>(null)
  /** The row the sheet is on, so a slow fetch cannot answer for a later one. */
  const wanted = useRef<string | null>(null)

  /**
   * Loading happens on the tap that opens the sheet rather than in an effect
   * watching it: the tap is the event, and an effect would be a second source
   * of truth for the same thing.
   */
  function open(row: OptimisticRow) {
    setEditing(row)
    wanted.current = row.id

    if (row.attachment_count === 0) {
      setPhotos([])
      setPhotosFor(row.id)
      return
    }

    setPhotos([])
    setPhotosFor(null)
    void loadAttachmentsAction('expense', row.id).then((rows) => {
      if (wanted.current !== row.id) return
      setPhotos(rows)
      setPhotosFor(row.id)
    })
  }

  function close() {
    wanted.current = null
    setEditing(null)
  }

  // A fresh server page means the filters moved or a write revalidated the
  // route. Either way the pages loaded on top of the old one are stale, so they
  // go: the alternative is showing rows the server has since changed.
  if (loaded.seed !== page) setLoaded(seedState(page))

  const items = useMemo(() => {
    const rows = loaded.seed === page ? [...page.rows, ...loaded.extra] : page.rows
    return buildLedgerItems(applyPending(rows, store.pending, filters))
  }, [page, loaded, store.pending, filters])

  /**
   * `vehicles[].odometer_km` is the highest reading the app has ever seen for
   * that car — the trigger in 0012 only ever raises it. So a row carrying a
   * lower number is a row whose reading is below the last one, which is exactly
   * the condition docs/02-DATA-MODEL.md asks the UI to flag rather than reject.
   */
  const lastReading = useMemo(
    () => new Map(vehicles.map((vehicle) => [vehicle.id, vehicle.odometer_km])),
    [vehicles],
  )

  function isBelowLastReading(row: LedgerRow): boolean {
    if (row.vehicle_id === null || row.odometer_km === null) return false
    const known = lastReading.get(row.vehicle_id)
    return known !== undefined && row.odometer_km < known
  }

  async function loadOlder() {
    if (loading || !loaded.cursor) return
    setLoading(true)
    try {
      const next = await loadLedgerPageAction(filters, loaded.cursor)
      setLoaded((previous) => ({
        ...previous,
        extra: [...previous.extra, ...next.rows],
        cursor: next.cursor,
        hasMore: next.hasMore,
      }))
    } finally {
      setLoading(false)
    }
  }

  function remove(row: LedgerRow) {
    const write = writeFromLedgerRow(row)
    // The photos are already loaded, because Delete lives in the sheet that
    // loaded them. Deleting the expense cascades their rows away; handing them
    // to the undo is what brings the photographs back and not just the amount.
    const held = photosFor === row.id ? photos.map(({ url: _url, ...draft }) => draft) : []
    close()
    store.run({ kind: 'delete', row }, () => deleteExpenseAction(row.id), {
      message: 'Expense deleted',
      label: 'Undo',
      run: () =>
        store.run({ kind: 'save', row, previous: null }, () =>
          restoreExpenseAction(write, row.created_at, held),
        ),
    })
  }

  if (items.length === 0) {
    return (
      <p className="rounded-md border border-border bg-surface p-6 text-body text-ink-muted">
        Nothing here. Log an expense, or widen the filters.
      </p>
    )
  }

  return (
    <>
      <div className="overflow-hidden rounded-md border border-border bg-surface">
        <VirtualList
          items={items}
          keyOf={(item) => item.key}
          itemHeight={ledgerItemHeight}
          renderItem={(item) =>
            item.kind === 'day' ? (
              <LedgerDayHeading
                heading={dayHeading(item.date, today)}
                total={item.total}
                currency={currency}
                locale={locale}
              />
            ) : (
              <LedgerRowButton
                row={item.row}
                locale={locale}
                icon={item.row.category_icon ? icons[item.row.category_icon] : null}
                signals={signals}
                lowOdometer={isBelowLastReading(item.row)}
                onOpen={() => open(item.row)}
              />
            )
          }
        />
      </div>

      {loaded.hasMore ? (
        <div className="mt-4 flex justify-center">
          <Button onClick={loadOlder} disabled={loading}>
            {loading ? 'Loading' : 'Load older'}
          </Button>
        </div>
      ) : null}

      <Sheet
        open={editing !== null}
        onClose={close}
        title="Edit expense"
        action={
          editing ? (
            <button
              type="button"
              onClick={() => remove(editing)}
              className="min-h-touch rounded-md px-3 text-label text-critical"
            >
              Delete
            </button>
          ) : null
        }
      >
        {editing && photosFor === editing.id ? (
          <ExpenseForm
            // Remounted per expense, so the form's own state starts from the
            // row and its photos rather than from whatever was open before.
            key={editing.id}
            mode="edit"
            initial={editing}
            userId={userId}
            initialAttachments={photos}
            categories={categories}
            icons={icons}
            vehicles={vehicles}
            currency={currency}
            locale={locale}
            amortiseThreshold={amortiseThreshold}
            today={today}
            onDone={close}
          />
        ) : null}
      </Sheet>
    </>
  )
}
