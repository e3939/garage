import type { ReactNode } from 'react'

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
  onOpen: () => void
}

export function LedgerRowButton({ row, locale, icon, onOpen }: LedgerRowButtonProps) {
  const title = row.merchant ?? row.category_name ?? 'Expense'
  const detail = [
    row.merchant ? row.category_name : null,
    row.vehicle_nickname,
    row.note,
    row.attachment_count > 0 ? `${row.attachment_count} photo` : null,
  ]
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
        <span className="block truncate text-caption">
          <span style={{ color: BUCKET_VAR[row.bucket] }}>{BUCKET_LABEL[row.bucket]}</span>
          {detail ? <span className="text-ink-muted">{` · ${detail}`}</span> : null}
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
 */
export function LedgerDayHeading({ heading, total, currency, locale }: LedgerDayHeadingProps) {
  return (
    <div
      style={{ height: LEDGER_DAY_HEIGHT }}
      className="flex items-center justify-between gap-4 border-b border-border bg-surface-sunken px-4"
    >
      <span className="text-eyebrow font-display uppercase text-ink-muted">{heading}</span>
      <Money amount={total} currency={currency} locale={locale} size="label" className="text-ink-muted" />
    </div>
  )
}
