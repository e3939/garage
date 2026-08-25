import 'server-only'

import { createClient } from '@/lib/supabase/server'
import { forgetSignedUrl } from '@/lib/storage/signed-url'
import { attachmentListSchema } from '@/lib/attachments/schema'
import {
  OWNER_COLUMN,
  type AttachmentDraft,
  type AttachmentOwner,
  type StorageBucket,
} from '@/lib/attachments/types'
import type { TablesInsert } from '@/lib/supabase/types'

/**
 * Which foreign key the owner goes in. Written out rather than computed from
 * `OWNER_COLUMN`, because a computed key widens the row to an index signature
 * and the generated insert type — correctly — refuses one.
 */
function ownerPatch(owner: AttachmentOwner, ownerId: string): Partial<TablesInsert<'attachments'>> {
  switch (owner) {
    case 'expense':
      return { expense_id: ownerId }
    case 'mod_plan':
      return { mod_plan_id: ownerId }
    case 'timeline_note':
      return { timeline_note_id: ownerId }
    case 'service_record':
      return { service_record_id: ownerId }
    case 'fuel_log':
      return { fuel_log_id: ownerId }
    case 'part':
      return { part_id: ownerId }
  }
}

const COLUMNS =
  'id, storage_path, bucket_name, kind, width, height, bytes, caption, sort_order'

/** Every photo belonging to one record, in the order it was put in. */
export async function fetchAttachments(
  owner: AttachmentOwner,
  ownerId: string,
): Promise<AttachmentDraft[]> {
  const supabase = await createClient()

  const { data, error } = await supabase
    .from('attachments')
    .select(COLUMNS)
    .eq(OWNER_COLUMN[owner], ownerId)
    .order('sort_order', { ascending: true })
    .order('created_at', { ascending: true })

  if (error) throw new Error(`attachments failed: ${error.message}`)
  return (data ?? []) as AttachmentDraft[]
}

/**
 * Make the stored set of photos equal the set the form was holding.
 *
 * Removals are real: the row goes and so does the object, because a photo the
 * user took off a record is a photo they meant to be rid of, and an object with
 * no row pointing at it can never be found again. Deleting the *record* is a
 * different thing — the rows cascade away but the objects are left, so an undo
 * can put them back. See AUTOPILOT-NOTES.md.
 *
 * Returns an error message, or null when the set was stored.
 */
export async function syncAttachments(
  owner: AttachmentOwner,
  ownerId: string,
  userId: string,
  raw: unknown,
): Promise<string | null> {
  const parsed = attachmentListSchema.safeParse(raw ?? [])
  if (!parsed.success) return parsed.error.issues[0]?.message ?? 'Those photos are not valid'

  const drafts = parsed.data
  const column = OWNER_COLUMN[owner]
  const supabase = await createClient()

  const { data: existing, error: readError } = await supabase
    .from('attachments')
    .select('id, storage_path, bucket_name')
    .eq(column, ownerId)

  if (readError) return readError.message

  const keep = new Set(drafts.map((draft) => draft.id))
  const dropped = (existing ?? []).filter((row) => !keep.has(row.id))

  if (dropped.length > 0) {
    const { error } = await supabase
      .from('attachments')
      .delete()
      .in(
        'id',
        dropped.map((row) => row.id),
      )
    if (error) return error.message
    await removeObjects(dropped)
  }

  if (drafts.length === 0) return null

  const rows: TablesInsert<'attachments'>[] = drafts.map((draft) => ({
    id: draft.id,
    user_id: userId,
    storage_path: draft.storage_path,
    bucket_name: draft.bucket_name,
    kind: draft.kind,
    width: draft.width,
    height: draft.height,
    bytes: draft.bytes,
    caption: draft.caption,
    sort_order: draft.sort_order,
    ...ownerPatch(owner, ownerId),
  }))

  const { error } = await supabase.from('attachments').upsert(rows, { onConflict: 'id' })

  return error ? error.message : null
}

/** Remove storage objects, one request per bucket. Failures are not fatal. */
export async function removeObjects(
  rows: readonly { storage_path: string; bucket_name: string }[],
): Promise<void> {
  const byBucket = new Map<string, string[]>()
  for (const row of rows) {
    const paths = byBucket.get(row.bucket_name) ?? []
    paths.push(row.storage_path)
    byBucket.set(row.bucket_name, paths)
  }

  const supabase = await createClient()
  await Promise.all(
    [...byBucket].map(async ([bucket, paths]) => {
      await supabase.storage.from(bucket).remove(paths)
      for (const path of paths) forgetSignedUrl(bucket as StorageBucket, path)
    }),
  )
}
