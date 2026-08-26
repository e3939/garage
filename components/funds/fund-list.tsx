// Rows that open two sheets, so the list holds which one is open.
'use client'

import { useState } from 'react'

import { ContributeSheet } from '@/components/funds/contribute-sheet'
import {
  FundSheet,
  type FundModOption,
  type FundVehicleOption,
} from '@/components/funds/fund-sheet'
import { PiggyBank } from '@/components/icons'
import { Button } from '@/components/ui/button'
import { EmptyState } from '@/components/ui/empty-state'
import { Money } from '@/components/ui/money'
import { Sheet } from '@/components/ui/sheet'
import type { IsoDate } from '@/lib/dates'
import type { FundStatus } from '@/lib/funds/types'

export type FundListProps = {
  funds: readonly FundStatus[]
  vehicles: readonly FundVehicleOption[]
  mods: readonly FundModOption[]
  currency: string
  locale: string
  today: IsoDate
  /** Month names, keyed by month start, formatted on the server. */
  monthLabels: Readonly<Record<string, string>>
}

type OpenSheet =
  | { kind: 'create' }
  | { kind: 'edit'; fund: FundStatus }
  | { kind: 'contribute'; fund: FundStatus }

/**
 * The funds, with what is in them and when they land.
 *
 * Every figure on a row — balance, progress, remaining, projected month — is
 * computed by `v_fund_status`. Nothing here adds anything up; the only
 * arithmetic is turning a fraction into a percentage for the bar's width.
 *
 * A bar, not a second tachometer. There are four signature elements in
 * docs/03-DESIGN.md and the arc is spent on the budget; a screen with five arcs
 * on it has no signature element, it has a texture.
 */
export function FundList({
  funds,
  vehicles,
  mods,
  currency,
  locale,
  today,
  monthLabels,
}: FundListProps) {
  const [open, setOpen] = useState<OpenSheet | null>(null)

  const title =
    open?.kind === 'create'
      ? 'New fund'
      : open?.kind === 'edit'
        ? open.fund.name
        : open?.kind === 'contribute'
          ? `Into ${open.fund.name}`
          : ''

  return (
    <section className="space-y-3">
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="text-eyebrow font-display uppercase text-ink-muted">Funds</h2>
        <button
          type="button"
          onClick={() => setOpen({ kind: 'create' })}
          className="min-h-touch text-label text-accent"
        >
          Start a fund
        </button>
      </div>

      {funds.length === 0 ? (
        <EmptyState
          icon={PiggyBank}
          action={
            <Button variant="primary" onClick={() => setOpen({ kind: 'create' })}>
              Start a fund
            </Button>
          }
        >
          No funds yet. Set a target and a monthly figure and this says when it lands.
        </EmptyState>
      ) : (
        <ul className="space-y-2">
          {funds.map((fund) => (
            <li key={fund.fund_id}>
              <FundRow
                fund={fund}
                locale={locale}
                monthLabels={monthLabels}
                onEdit={() => setOpen({ kind: 'edit', fund })}
                onContribute={() => setOpen({ kind: 'contribute', fund })}
              />
            </li>
          ))}
        </ul>
      )}

      <Sheet open={open !== null} onClose={() => setOpen(null)} title={title}>
        {open?.kind === 'contribute' ? (
          <ContributeSheet
            fund={open.fund}
            locale={locale}
            today={today}
            onDone={() => setOpen(null)}
          />
        ) : open ? (
          <FundSheet
            mode={open.kind === 'create' ? 'create' : 'edit'}
            initial={open.kind === 'edit' ? open.fund : null}
            vehicles={vehicles}
            mods={mods}
            currency={currency}
            locale={locale}
            today={today}
            monthLabels={monthLabels}
            onDone={() => setOpen(null)}
          />
        ) : null}
      </Sheet>
    </section>
  )
}

function FundRow({
  fund,
  locale,
  monthLabels,
  onEdit,
  onContribute,
}: {
  fund: FundStatus
  locale: string
  monthLabels: Readonly<Record<string, string>>
  onEdit: () => void
  onContribute: () => void
}) {
  const progress = fund.progress ?? 0
  const width = Math.min(Math.max(progress, 0), 1) * 100
  const funded = fund.remaining === 0
  const closed = fund.closed_at !== null

  return (
    <div
      className={[
        'space-y-3 rounded-md border border-border bg-surface p-3',
        closed ? 'opacity-60' : '',
      ].join(' ')}
    >
      <div className="flex items-baseline justify-between gap-3">
        <button type="button" onClick={onEdit} className="min-w-0 flex-1 text-left">
          <span className="block truncate text-title text-ink">{fund.name}</span>
          <span className="block truncate text-caption text-ink-muted">
            {fund.mod_title ?? fund.vehicle_nickname ?? 'Not linked to anything'}
            {closed ? ' · closed' : null}
          </span>
        </button>
        <span className="shrink-0 text-right">
          <Money
            amount={fund.balance}
            currency={fund.currency}
            locale={locale}
            size="odometer"
            roll
          />
        </span>
      </div>

      <div
        className="h-1 w-full overflow-hidden rounded-full bg-surface-sunken"
        role="img"
        aria-label={`${Math.round(progress * 100)} per cent of the target saved`}
      >
        <div
          className="h-full rounded-full"
          style={{
            width: `${width.toFixed(1)}%`,
            backgroundColor: funded ? 'var(--positive)' : 'var(--accent)',
          }}
        />
      </div>

      <p className="text-caption text-ink-muted">
        {funded ? (
          <>
            {'Funded. '}
            <Money
              amount={fund.target_amount}
              currency={fund.currency}
              locale={locale}
              size="label"
              className="text-ink"
            />
            {' of a '}
            <Money
              amount={fund.target_amount}
              currency={fund.currency}
              locale={locale}
              size="label"
            />
            {' target.'}
          </>
        ) : (
          <>
            <Money
              amount={fund.remaining}
              currency={fund.currency}
              locale={locale}
              size="label"
              className="text-ink"
            />
            {' to go of '}
            <Money
              amount={fund.target_amount}
              currency={fund.currency}
              locale={locale}
              size="label"
            />
            {'.'}
          </>
        )}
      </p>

      <div className="flex items-center justify-between gap-3">
        <p className="min-w-0 flex-1 truncate text-caption text-ink-faint">
          <ProjectionLine fund={fund} locale={locale} monthLabels={monthLabels} />
        </p>
        {closed ? null : (
          <Button size="sm" variant="secondary" onClick={onContribute} className="shrink-0">
            Log a contribution
          </Button>
        )}
      </div>
    </div>
  )
}

/**
 * "At 2.000.000 a month, funded by March 2027."
 *
 * The month name comes with the row: it is `projected_on` from the view, put
 * into words on the server. Without a monthly figure there is no sentence to
 * write, and the row says that rather than guessing at a date.
 */
function ProjectionLine({
  fund,
  locale,
  monthLabels,
}: {
  fund: FundStatus
  locale: string
  monthLabels: Readonly<Record<string, string>>
}) {
  if (fund.remaining === 0) return <>Ready when you are.</>

  if (fund.monthly_contribution === null || fund.projected_on === null) {
    return <>No monthly figure set, so no projected date.</>
  }

  return (
    <>
      {'At '}
      <Money
        amount={fund.monthly_contribution}
        currency={fund.currency}
        locale={locale}
        size="label"
      />
      {' a month, funded by '}
      {monthLabels[fund.projected_on] ?? `${fund.months_remaining} months from now`}
      {'.'}
    </>
  )
}
