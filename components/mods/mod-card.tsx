// Part of the board: it carries a drag handle and opens a sheet.
'use client'

import type { KeyboardEvent as ReactKeyboardEvent, PointerEvent as ReactPointerEvent } from 'react'

import { Grip } from '@/components/icons/grip'
import { Thumbnail } from '@/components/attachments/thumbnail'
import { Money } from '@/components/ui/money'
import type { ModIcons } from '@/components/mods/mod-icons'
import { blockers, MOD_PRIORITY_LABEL, type ModCard as Mod } from '@/lib/mods/types'

/** Three is what fits on a card at 390px without the card becoming a gallery. */
const THUMBS = 3

type ModCardProps = {
  card: Mod
  icons: ModIcons
  locale: string
  /** "25 Aug 2026", formatted on the server. Null when there is no target date. */
  targetLabel: string | null
  dragging: boolean
  onOpen: () => void
  onGrab: (event: ReactPointerEvent<HTMLElement>) => void
  onHandleKey: (event: ReactKeyboardEvent<HTMLElement>) => void
}

/**
 * One card on the board.
 *
 * The handle is a separate control from the body, because a card has two jobs —
 * move me, and open me — and a phone cannot tell a slow tap from the start of a
 * drag reliably enough to guess. The handle carries `touch-action: none` so a
 * drag starting there never becomes a scroll; everywhere else on the card the
 * column and the carousel scroll normally.
 *
 * While a card is in the air it stays exactly where it was, at reduced opacity,
 * rather than being lifted out of the list. Nothing reflows, so the geometry the
 * drop is measured against holds still — see `lib/mods/board.ts`.
 */
export function ModCardView({
  card,
  icons,
  locale,
  targetLabel,
  dragging,
  onOpen,
  onGrab,
  onHandleKey,
}: ModCardProps) {
  const blocked = blockers(card)
  const extra = card.photos.length - THUMBS

  return (
    <article
      data-card={card.id}
      className={[
        'flex items-start gap-1 rounded-md border border-border bg-surface p-2',
        dragging ? 'opacity-40' : '',
      ].join(' ')}
    >
      <button
        type="button"
        aria-label={`Move ${card.title}`}
        onPointerDown={onGrab}
        onKeyDown={onHandleKey}
        className="flex size-touch shrink-0 cursor-grab items-center justify-center rounded-sm text-ink-faint"
        style={{ touchAction: 'none' }}
      >
        <Grip />
      </button>

      <button
        type="button"
        onClick={onOpen}
        className="min-w-0 flex-1 space-y-1 py-1 pr-1 text-left"
      >
        <span className="block text-body font-medium text-ink">{card.title}</span>

        <span className="block text-caption text-ink-muted">
          {MOD_PRIORITY_LABEL[card.priority]}
          {targetLabel ? ` · ${targetLabel}` : ''}
        </span>

        <Estimate card={card} locale={locale} />

        {blocked.length > 0 ? (
          <span className="flex items-start gap-1 text-caption text-critical">
            <span className="shrink-0 text-attention">{icons.blocked}</span>
            <span>Blocked by: {blocked.map((entry) => entry.title).join(', ')}</span>
          </span>
        ) : null}

        {card.photos.length > 0 ? (
          <span className="flex items-center gap-1 pt-1">
            {card.photos.slice(0, THUMBS).map((photo) => (
              <Thumbnail
                key={photo.id}
                url={photo.url}
                id={photo.id}
                caption={photo.caption}
                context={card.title}
                size={40}
              />
            ))}
            {extra > 0 ? <span className="text-caption text-ink-faint">{`+${extra}`}</span> : null}
          </span>
        ) : null}
      </button>
    </article>
  )
}

/**
 * What the card says about money.
 *
 * Before it is installed that is the estimate, as a range if a range was given.
 * Once expenses point at it the actual takes the front and the estimate moves
 * behind a signed variance, because at that point what it cost is the fact and
 * what it was going to cost is the comparison.
 */
function Estimate({ card, locale }: { card: Mod; locale: string }) {
  const { est_cost_min: low, est_cost_max: high, currency } = card

  if (card.expense_count > 0) {
    return (
      <span className="flex flex-wrap items-baseline gap-2">
        <Money amount={card.actual} currency={currency} locale={locale} size="label" />
        {card.variance === null ? (
          <span className="text-caption text-ink-faint">No estimate to compare</span>
        ) : (
          <span
            className={[
              'text-caption',
              card.variance > 0 ? 'text-critical' : card.variance < 0 ? 'text-positive' : 'text-ink-muted',
            ].join(' ')}
          >
            <Money
              amount={card.variance}
              currency={currency}
              locale={locale}
              size="label"
              signDisplay="always"
            />
            {' against plan'}
          </span>
        )}
      </span>
    )
  }

  if (low === null && high === null) {
    return <span className="block text-caption text-ink-faint">No estimate yet</span>
  }

  if (low !== null && high !== null && low !== high) {
    return (
      <span className="flex flex-wrap items-baseline gap-1">
        <Money amount={low} currency={currency} locale={locale} size="label" />
        <span className="text-caption text-ink-faint">to</span>
        <Money amount={high} currency={currency} locale={locale} size="label" />
      </span>
    )
  }

  return (
    <span className="block">
      <Money amount={(low ?? high) as number} currency={currency} locale={locale} size="label" />
    </span>
  )
}
