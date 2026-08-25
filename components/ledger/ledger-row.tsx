import type { ReactNode } from 'react'

import type { LedgerSignalIcons } from '@/components/ledger/row-signals'
import { Money } from '@/components/ui/money'
import { BUCKET_LABEL, BUCKET_VAR } from '@/lib/expenses/types'
import type { OptimisticRow } from '@/lib/expenses/optimistic'

/**
 * Rows are a fixed height so the list can be virtualised without measuring, and
 * so the ledger reads as a ruled grid rather than a stack of cards. Text
 * truncates; it never wraps.
 */
export const LEDGER_ROW_HEIGHT = 64
export const LEDGER_DAY_HEIGHT = 32

type LedgerRowButtonProps = {
  row: OptimisticRow
  locale: string
  icon: ReactNode
  signals: LedgerSignalIcons
  /**
   * This row's odometer reading is below the vehicle's last known one. The
   * reading was saved exactly as typed — a reading someone actually took is
   * data — and this is the flag docs/02-DATA-MODEL.md asks for in its place.
   */
  lowOdometer?: boolean
  onOpen: () => void
}

/**
 * The detail line carries structured fields only — bucket, category, vehicle —
 * and never free text. A note is a sentence of arbitrary length, and putting one
 * in a fixed-height row means the row's own fields are what gets cut off
 * (docs/03-DESIGN.md, "The ledger detail line"). The note is still there; it is
 * marked by a glyph at the end of the line and read in full in the detail sheet.
 */
export function LedgerRowButton({
  row,
  locale,
  icon,
  signals,
  lowOdometer = false,
  onOpen,
}: LedgerRowButtonProps) {
  const title = row.merchant ?? row.category_name ?? 'Expense'
  const detail = [row.merchant ? row.category_name : null, row.vehicle_nickname]
    .filter((part): part is string => Boolean(part))
    .join(' · ')

  const marker =
    row.amortize_months > 1
      ? `Over ${row.amortize_months} months`
      : row.counts_toward_budget
        ? null
        : 'Kept out'

  return (
    <button
      type="button"
      onClick={onOpen}
      style={{ height: LEDGER_ROW_HEIGHT }}
      className={[
        'flex w-full items-center gap-3 border-b border-border px-4 text-left',
        row.pending ? 'opacity-60' : '',
      ].join(' ')}
    >
      <span
        aria-hidden
        className="flex size-8 shrink-0 items-center justify-center rounded-full"
        style={{
          color: row.category_colour_hex ?? 'var(--text-muted)',
          backgroundColor: 'var(--surface-sunken)',
        }}
      >
        {icon}
      </span>

      <span className="min-w-0 flex-1">
        <span className="block truncate text-body text-ink">{title}</span>
        <span className="flex items-center gap-2 text-caption">
          <span className="min-w-0 truncate">
            <span style={{ color: BUCKET_VAR[row.bucket] }}>{BUCKET_LABEL[row.bucket]}</span>
            {detail ? <span className="text-ink-muted">{` · ${detail}`}</span> : null}
          </span>
          {/* One glyph per signal, always in this order, always at the end.
              The odometer flag leads, because the other two say there is more
              to read and this one says something may be wrong. */}
          {lowOdometer ? (
            <span className="shrink-0 text-attention">
              {signals.lowOdometer}
              <span className="sr-only">Odometer lower than the last reading</span>
            </span>
          ) : null}
          {row.note ? (
            <span className="shrink-0 text-ink-faint">
              {signals.note}
              <span className="sr-only">Has a note</span>
            </span>
          ) : null}
          {row.attachment_count > 0 ? (
            <span className="shrink-0 text-ink-faint">
              {signals.attachment}
              <span className="sr-only">Has a photo</span>
            </span>
          ) : null}
        </span>
      </span>

      <span className="shrink-0 text-right">
        <Money
          amount={row.amount}
          currency={row.currency}
          locale={locale}
          size="odometer"
          className={row.amount < 0 ? 'text-positive' : 'text-ink'}
        />
        {marker ? <span className="block text-caption text-ink-faint">{marker}</span> : null}
      </span>
    </button>
  )
}

type LedgerDayHeadingProps = {
  heading: string
  total: number
  currency: string
  locale: string
}

/**
 * The subtotal is the whole day under the current filters, computed by
 * `ledger_page`, so it stays right when a day straddles a page boundary.
 *
 * It carries a view label like every other total in the app, and the label is a
 * constant: a day's subtotal is cash out on that day, at full amount, whatever
 * the budget switch says and whatever the expense was spread over. That is the
 * all-in view by definition. The ledger is a register of what was paid, not a
 * report, so the switcher does not appear on it — but the number still has to
 * say which of the three it is (docs/01-PRODUCT.md).
 */
export function LedgerDayHeading({ heading, total, currency, locale }: LedgerDayHeadingProps) {
  return (
    <div
      style={{ height: LEDGER_DAY_HEIGHT }}
      className="flex items-center justify-between gap-4 border-b border-border bg-surface-sunken px-4"
    >
      <span className="text-eyebrow font-display uppercase text-ink-muted">{heading}</span>
      <span className="flex shrink-0 items-baseline gap-2">
        <span className="text-eyebrow font-display uppercase text-ink-faint">All-in</span>
        <Money
          amount={total}
          currency={currency}
          locale={locale}
          size="label"
          className="text-ink-muted"
        />
      </span>
    </div>
  )
}
