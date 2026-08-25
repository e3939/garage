'use server'

/**
 * The two things the upload field needs from the server, and nothing else.
 *
 * Uploading is done by the browser straight to storage — the object's path
 * begins with the signed-in user's id and the storage policy checks exactly that
 * — so there is no upload action here. What the browser cannot do on its own is
 * read back the photos a record already has, and tidy up a file it uploaded and
 * then changed its mind about.
 */

import { createClient } from '@/lib/supabase/server'
import { removeObjects, fetchAttachments } from '@/lib/attachments/server'
import { signAttachments } from '@/lib/storage/signed-url'
import type { ActionResult } from '@/app/(app)/expenses/actions'
import type { AttachmentOwner, AttachmentView } from '@/lib/attachments/types'
import { OWNER_COLUMN } from '@/lib/attachments/types'

const OWNERS = Object.keys(OWNER_COLUMN) as AttachmentOwner[]

/**
 * The photos on one record, signed, for a sheet that is about to edit them.
 *
 * Loaded when the sheet opens rather than sent with every row of the ledger: a
 * page of forty rows would otherwise carry forty sets of metadata and forty
 * signed URLs so that one of them could be tapped.
 */
export async function loadAttachmentsAction(
  rawOwner: unknown,
  rawId: unknown,
): Promise<AttachmentView[]> {
  if (typeof rawOwner !== 'string' || !OWNERS.includes(rawOwner as AttachmentOwner)) return []
  if (typeof rawId !== 'string' || rawId === '') return []
  return signAttachments(await fetchAttachments(rawOwner as AttachmentOwner, rawId))
}

/**
 * An object uploaded during a session that was then removed from the field, or
 * abandoned by closing the sheet. It has no row pointing at it and never will,
 * so it goes.
 *
 * The path is checked against the caller's own id before anything is deleted.
 * The storage policy would refuse another user's path anyway; this makes the
 * refusal happen here, where it can be a sentence.
 */
export async function discardUploadAction(
  rawBucket: unknown,
  rawPath: unknown,
): Promise<ActionResult> {
  if (typeof rawBucket !== 'string' || typeof rawPath !== 'string' || rawPath === '') {
    return { ok: false, error: 'Unknown photo' }
  }
  if (rawBucket !== 'receipts' && rawBucket !== 'inspiration' && rawBucket !== 'vehicles') {
    return { ok: false, error: 'Unknown photo' }
  }

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { ok: false, error: 'Sign in again' }
  if (!rawPath.startsWith(`${user.id}/`)) return { ok: false, error: 'Unknown photo' }

  await removeObjects([{ bucket_name: rawBucket, storage_path: rawPath }])
  return { ok: true }
}
