'use server'

/**
 * Timeline notes and the feed's paging.
 *
 * A note is the cost-free half of the build log: a drive, a meet, a wash, a
 * thought. Same shape as every other write in the app — parse with the shared
 * schema, stamp the user, write, revalidate — plus the photos, which are synced
 * in the same call so a note and its pictures land together or not at all.
 */

import { revalidatePath } from 'next/cache'

import { createClient } from '@/lib/supabase/server'
import { syncAttachments } from '@/lib/attachments/server'
import {
  timelineNoteIdSchema,
  timelineNoteWriteSchema,
  type TimelineNoteWrite,
} from '@/lib/timeline/schema'
import { fetchTimelineNote, fetchTimelinePage, TIMELINE_PAGE_SIZE } from '@/lib/queries/timeline'
import { fetchAttachments } from '@/lib/attachments/server'
import { signAttachments } from '@/lib/storage/signed-url'
import type { TimelineCursor, TimelinePage } from '@/lib/timeline/types'
import type { AttachmentView } from '@/lib/attachments/types'
import type { ActionResult } from '@/app/(app)/expenses/actions'

function revalidateTimeline(): void {
  // The vehicle home carries the feed; a note also moves nothing else, but the
  // odometer trigger does not run on notes so no total can have changed.
  revalidatePath('/garage', 'layout')
}

async function currentUserId(): Promise<string | null> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  return user?.id ?? null
}

function firstIssue(error: unknown): string {
  if (error && typeof error === 'object' && 'issues' in error) {
    const issues = (error as { issues: { message: string }[] }).issues
    return issues[0]?.message ?? 'That entry is not valid'
  }
  return 'That entry is not valid'
}

function toRow(input: TimelineNoteWrite, userId: string) {
  return {
    id: input.id,
    user_id: userId,
    vehicle_id: input.vehicle_id,
    occurred_on: input.occurred_on,
    title: input.title,
    body: input.body,
    odometer_km: input.odometer_km,
  }
}

export async function createTimelineNoteAction(
  raw: unknown,
  rawAttachments: unknown = [],
): Promise<ActionResult> {
  const parsed = timelineNoteWriteSchema.safeParse(raw)
  if (!parsed.success) return { ok: false, error: firstIssue(parsed.error) }

  const userId = await currentUserId()
  if (!userId) return { ok: false, error: 'Sign in again to save this' }

  const supabase = await createClient()
  const { error } = await supabase.from('timeline_notes').insert(toRow(parsed.data, userId))
  if (error) return { ok: false, error: error.message }

  const photoError = await syncAttachments('timeline_note', parsed.data.id, userId, rawAttachments)
  if (photoError) return { ok: false, error: photoError }

  revalidateTimeline()
  return { ok: true }
}

export async function updateTimelineNoteAction(
  raw: unknown,
  rawAttachments: unknown = [],
): Promise<ActionResult> {
  const parsed = timelineNoteWriteSchema.safeParse(raw)
  if (!parsed.success) return { ok: false, error: firstIssue(parsed.error) }

  const userId = await currentUserId()
  if (!userId) return { ok: false, error: 'Sign in again to save this' }

  const supabase = await createClient()
  const { user_id: _userId, id, ...columns } = toRow(parsed.data, userId)
  const { error } = await supabase.from('timeline_notes').update(columns).eq('id', id)
  if (error) return { ok: false, error: error.message }

  const photoError = await syncAttachments('timeline_note', id, userId, rawAttachments)
  if (photoError) return { ok: false, error: photoError }

  revalidateTimeline()
  return { ok: true }
}

/**
 * Hard delete, like an expense. The attachment rows cascade with it; the storage
 * objects are left, because they are what an undo would need and an orphan costs
 * a few hundred kilobytes rather than any correctness.
 */
export async function deleteTimelineNoteAction(rawId: unknown): Promise<ActionResult> {
  const parsed = timelineNoteIdSchema.safeParse(rawId)
  if (!parsed.success) return { ok: false, error: 'Unknown entry' }

  const supabase = await createClient()
  const { error } = await supabase.from('timeline_notes').delete().eq('id', parsed.data)
  if (error) return { ok: false, error: error.message }

  revalidateTimeline()
  return { ok: true }
}

export type LoadedNote = {
  note: {
    id: string
    vehicle_id: string
    occurred_on: string
    title: string
    body: string | null
    odometer_km: number | null
  }
  attachments: AttachmentView[]
}

/**
 * One note and its photos, for the sheet that edits it. Loaded on the tap that
 * opens it rather than sent with every row of the feed.
 */
export async function loadTimelineNoteAction(rawId: unknown): Promise<LoadedNote | null> {
  const parsed = timelineNoteIdSchema.safeParse(rawId)
  if (!parsed.success) return null

  const note = await fetchTimelineNote(parsed.data)
  if (!note) return null

  return {
    note,
    attachments: await signAttachments(await fetchAttachments('timeline_note', parsed.data)),
  }
}

/**
 * The next keyset page of the feed. A server action rather than a route handler
 * so the query, the RLS-scoped client and the URL signing all stay on the server
 * and the browser receives finished rows.
 */
export async function loadTimelinePageAction(
  rawVehicleId: unknown,
  cursor: TimelineCursor | null,
): Promise<TimelinePage> {
  if (typeof rawVehicleId !== 'string' || rawVehicleId === '') {
    return { rows: [], cursor: null, hasMore: false }
  }
  return fetchTimelinePage(rawVehicleId, cursor, TIMELINE_PAGE_SIZE)
}
