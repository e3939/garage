import type { AttachmentView } from '@/lib/attachments/types'
import type { IsoDate } from '@/lib/dates'
import type { Enums } from '@/lib/supabase/types'

export type TimelineKind = Enums<'timeline_kind'>

/** One fill inside a collapsed fuel month. */
export type TimelineFill = {
  ref_id: string
  occurred_on: IsoDate
  /** "25 Aug 2026", formatted on the server. See `TimelineRow`. */
  date_label: string
  title: string
  subtitle: string | null
  amount: number | null
}

/**
 * One row of the build log, as `timeline_page` returns it and after its photos
 * have been signed.
 *
 * `items` is non-empty only on a collapsed fuel month. Every other kind carries
 * an empty array rather than a null, so the renderer never has to ask.
 *
 * The two label fields are dates already turned into words. That is done on the
 * server, including for pages fetched later by the "Load older" action, because
 * a locale's month and weekday names are around eight kilobytes gzipped and the
 * feed is otherwise a list of strings the server already has. Same reasoning as
 * the icons: draw it once, where it is free. See `lib/dates-display.ts`.
 */
export type TimelineRow = {
  ref_id: string
  kind: TimelineKind
  occurred_on: IsoDate
  created_at: string
  /** "Yesterday", "Tue 25 Aug" — the heading of the day this row belongs to. */
  day_heading: string
  /** "25 Aug 2026" — this row's own date, for alt text and for fill lists. */
  date_label: string
  title: string
  subtitle: string | null
  amount: number | null
  currency: string | null
  vehicle_id: string
  /**
   * The dealer stamp's caption, or null for a row that is not stamped.
   *
   * docs/03-DESIGN.md, signature element 3: milestones and installed mods
   * render as a stamp. `v_timeline` decides which — a milestone carries its own
   * title, an installed mod carries "Installed" — so the feed never has to
   * recognise a status by reading the subtitle it happens to print today.
   */
  stamp: string | null
  items: TimelineFill[]
  photos: AttachmentView[]
}

/** The keyset cursor: the last row of the page just rendered. */
export type TimelineCursor = {
  occurred_on: IsoDate
  created_at: string
  ref_id: string
}

export type TimelinePage = {
  rows: TimelineRow[]
  cursor: TimelineCursor | null
  hasMore: boolean
}

/** What each kind is called in the feed, when it needs naming in words. */
export const KIND_LABEL: Readonly<Record<TimelineKind, string>> = {
  expense: 'Expense',
  mod: 'Mod',
  service: 'Service',
  fuel: 'Fuel',
  milestone: 'Milestone',
  note: 'Note',
}

/**
 * The feed is day-grouped, the same way the ledger is: a heading per day, then
 * the rows that landed on it.
 */
export type TimelineItem =
  | { kind: 'day'; key: string; date: IsoDate; heading: string }
  | { kind: 'row'; key: string; row: TimelineRow }

export function buildTimelineItems(rows: readonly TimelineRow[]): TimelineItem[] {
  const items: TimelineItem[] = []
  let day: IsoDate | null = null

  for (const row of rows) {
    if (row.occurred_on !== day) {
      day = row.occurred_on
      items.push({ kind: 'day', key: `day-${day}`, date: day, heading: row.day_heading })
    }
    items.push({ kind: 'row', key: row.ref_id, row })
  }

  return items
}

export function cursorOf(row: TimelineRow): TimelineCursor {
  return { occurred_on: row.occurred_on, created_at: row.created_at, ref_id: row.ref_id }
}
