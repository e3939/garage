// Rendered inside the feed, which is a client component: tapping a photo opens
// the viewer and tapping a fuel month expands it.
'use client'

import type { ReactNode } from 'react'

import { Thumbnail } from '@/components/attachments/thumbnail'
import { Money } from '@/components/ui/money'
import type { TimelineRow } from '@/lib/timeline/types'

type TimelineRowCardProps = {
  row: TimelineRow
  icon: ReactNode
  locale: string
  /** The first row on the screen is above the fold; the rest are not. */
  eager: boolean
  onOpenPhoto: (row: TimelineRow, index: number) => void
  /** Present when this kind of entry can be edited. Notes can; the rest are
      written by the thing that caused them. */
  onOpen?: () => void
}

/**
 * One entry in the build log.
 *
 * The line under the title is the same rule as the ledger's: structured fields
 * only, never free text (docs/03-DESIGN.md). A note's body and a photo's caption
 * are read where there is room for them — the caption in the viewer, the body in
 * the entry's own sheet.
 *
 * `content-visibility: auto` is what keeps a long feed cheap. A timeline row is
 * variable height, so the ledger's measured virtualisation does not apply to it;
 * this hands the same job to the browser, which skips rendering and layout for
 * anything off screen and still reports an honest scroll height.
 */
export function TimelineRowCard({
  row,
  icon,
  locale,
  eager,
  onOpenPhoto,
  onOpen,
}: TimelineRowCardProps) {
  const showAmount = row.amount !== null && row.currency !== null

  // The title is the control, not the whole row: the photographs underneath are
  // buttons of their own and a button cannot contain a button.
  const heading = (
    <>
      <span className="block truncate text-body text-ink">{row.title}</span>
      {row.subtitle ? (
        <span className="block truncate text-caption text-ink-muted">{row.subtitle}</span>
      ) : null}
    </>
  )

  return (
    <article
      className="feed-row border-b border-border px-4 py-3 last:border-b-0"
      aria-label={row.title}
    >
      <div className="flex items-start gap-3">
        <span
          aria-hidden
          className="mt-px flex size-8 shrink-0 items-center justify-center rounded-full bg-surface-sunken text-ink-muted"
        >
          {icon}
        </span>

        <div className="min-w-0 flex-1">
          {onOpen ? (
            <button type="button" onClick={onOpen} className="block w-full text-left">
              {heading}
              <span className="sr-only">Edit this entry</span>
            </button>
          ) : (
            heading
          )}
        </div>

        {showAmount ? (
          <Money
            amount={row.amount as number}
            currency={row.currency ?? undefined}
            locale={locale}
            size="odometer"
            className={(row.amount as number) < 0 ? 'text-positive' : 'text-ink'}
          />
        ) : null}
      </div>

      {row.photos.length > 0 ? (
        <ul className="mt-3 flex flex-wrap gap-3 pl-[44px]">
          {row.photos.map((photo, index) => (
            <li key={photo.id}>
              <button
                type="button"
                onClick={() => onOpenPhoto(row, index)}
                className="block rounded-sm"
              >
                <Thumbnail
                  url={photo.url}
                  id={photo.id}
                  caption={photo.caption}
                  context={`${row.title}, ${row.date_label}`}
                  size={72}
                  eager={eager && index === 0}
                />
                <span className="sr-only">Open photo {index + 1}</span>
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </article>
  )
}
