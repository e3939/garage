import 'server-only'

import { createClient } from '@/lib/supabase/server'
import { signAttachments } from '@/lib/storage/signed-url'
import type { AttachmentDraft, AttachmentView } from '@/lib/attachments/types'
import type {
  TimelineCursor,
  TimelineFill,
  TimelinePage,
  TimelineRow,
} from '@/lib/timeline/types'
import { todayIso, type IsoDate } from '@/lib/dates'
import { dateLabel, dayHeading } from '@/lib/dates-display'

/**
 * How many rows a page of the feed holds. Smaller than the ledger's forty
 * because a timeline row carries photographs and a page of them is what the
 * phone actually downloads.
 */
export const TIMELINE_PAGE_SIZE = 30

/** The view returns jsonb; these two put a type back on it without trusting it. */
function fills(raw: unknown): TimelineFill[] {
  if (!Array.isArray(raw)) return []
  return (raw as Omit<TimelineFill, 'date_label'>[]).map((fill) => ({
    ...fill,
    date_label: dateLabel(fill.occurred_on),
  }))
}

function photos(raw: unknown): AttachmentDraft[] {
  if (!Array.isArray(raw)) return []
  return raw as AttachmentDraft[]
}

type RawRow = {
  ref_id: string
  kind: TimelineRow['kind']
  occurred_on: IsoDate
  created_at: string
  title: string
  subtitle: string | null
  amount: number | null
  currency: string | null
  vehicle_id: string
  items: unknown
  photos: unknown
  stamp: string | null
}

/**
 * One keyset page of a vehicle's build log, with every photo on it already
 * signed.
 *
 * Two round trips for a whole page, whatever it holds: `timeline_page` brings
 * the rows and their attachment rows together, and `signAttachments` signs the
 * lot in one request per bucket. A feed that signed per photo would make a
 * hundred round trips before it rendered anything.
 */
export async function fetchTimelinePage(
  vehicleId: string,
  cursor: TimelineCursor | null = null,
  limit: number = TIMELINE_PAGE_SIZE,
): Promise<TimelinePage> {
  const supabase = await createClient()

  // One more than we show, so "is there another page" costs no count.
  const { data, error } = await supabase.rpc('timeline_page', {
    p_vehicle_id: vehicleId,
    p_limit: limit + 1,
    p_cursor_occurred_on: cursor?.occurred_on,
    p_cursor_created_at: cursor?.created_at,
    p_cursor_id: cursor?.ref_id,
  })

  if (error) throw new Error(`timeline_page failed: ${error.message}`)

  const all = (data ?? []) as unknown as RawRow[]
  const hasMore = all.length > limit
  const page = hasMore ? all.slice(0, limit) : all

  const flat = page.flatMap((row) => photos(row.photos))
  const signed = await signAttachments(flat)

  const byId = new Map<string, AttachmentView>()
  for (const view of signed) byId.set(view.id, view)

  const today = todayIso()

  const rows: TimelineRow[] = page.map((row) => ({
    ref_id: row.ref_id,
    kind: row.kind,
    occurred_on: row.occurred_on,
    created_at: row.created_at,
    day_heading: dayHeading(row.occurred_on, today),
    date_label: dateLabel(row.occurred_on),
    title: row.title,
    subtitle: row.subtitle,
    amount: row.amount,
    currency: row.currency,
    vehicle_id: row.vehicle_id,
    stamp: row.stamp ?? null,
    items: fills(row.items),
    photos: photos(row.photos)
      .map((photo) => byId.get(photo.id))
      .filter((photo): photo is AttachmentView => Boolean(photo)),
  }))

  const last = rows[rows.length - 1]

  return {
    rows,
    cursor:
      hasMore && last
        ? { occurred_on: last.occurred_on, created_at: last.created_at, ref_id: last.ref_id }
        : null,
    hasMore,
  }
}

/** One note, for the edit sheet. Null when it is not this user's. */
export async function fetchTimelineNote(id: string) {
  const supabase = await createClient()

  const { data, error } = await supabase
    .from('timeline_notes')
    .select('id, vehicle_id, occurred_on, title, body, odometer_km')
    .eq('id', id)
    .maybeSingle()

  if (error) throw new Error(`timeline_notes failed: ${error.message}`)
  return data
}
