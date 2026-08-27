import type { ImageRole } from '@/lib/images/budgets'
import type { Enums } from '@/lib/supabase/types'

/**
 * The four private buckets from docs/02-DATA-MODEL.md. Object paths are
 * `{user_id}/{vehicle_id}/{uuid}.{ext}`, and the first segment is what every
 * storage policy checks.
 *
 * `gallery` is the odd one: everything in the other three has been compressed
 * before it was uploaded, and everything in `gallery` is the untouched original,
 * so its objects are not always `.webp` and are the only ones that can be HEIC.
 *
 * This lives here rather than next to the signing helper because the upload
 * field is a client component and the signing helper is `server-only`.
 */
export type StorageBucket = 'receipts' | 'inspiration' | 'vehicles' | 'gallery'

export type AttachmentKind = Enums<'attachment_kind'>

/**
 * One photo, as the form holds it before the row exists.
 *
 * The file is already in storage by the time a draft carries a path — uploading
 * happens while the sheet is open, not on save, because a save that waits on
 * four megabytes of upload is not a save that feels instant. The row in
 * `attachments` is written when the entity it belongs to is written.
 */
export type AttachmentDraft = {
  id: string
  storage_path: string
  bucket_name: StorageBucket
  kind: AttachmentKind
  width: number | null
  height: number | null
  bytes: number | null
  caption: string | null
  sort_order: number
}

/** A draft plus somewhere to render it from: a signed URL, or a local blob. */
export type AttachmentView = AttachmentDraft & { url: string | null }

/**
 * Which bucket, which `attachment_kind` and which compression budget an
 * owner's photos use.
 *
 * Three buckets exist and six things can own an attachment, so the mapping is
 * stated once here rather than guessed at each call site. Timeline notes and
 * service records are photographs of the car, so they live with the car.
 *
 * `role` picks the budget in `lib/images/budgets.ts`. A receipt is read once
 * for its numbers; a progress photo is opened full-screen like an inspiration
 * shot, so it gets the same allowance.
 */
export const ATTACHMENT_TARGET = {
  expense: { bucket: 'receipts', kind: 'receipt', role: 'receipt' },
  mod_plan: { bucket: 'inspiration', kind: 'inspiration', role: 'inspiration' },
  timeline_note: { bucket: 'vehicles', kind: 'progress', role: 'inspiration' },
  service_record: { bucket: 'receipts', kind: 'receipt', role: 'receipt' },
  fuel_log: { bucket: 'receipts', kind: 'receipt', role: 'receipt' },
  part: { bucket: 'vehicles', kind: 'progress', role: 'inspiration' },
} as const satisfies Record<
  string,
  { bucket: StorageBucket; kind: AttachmentKind; role: ImageRole }
>

export type AttachmentOwner = keyof typeof ATTACHMENT_TARGET

/** The column on `attachments` that carries each owner. */
export const OWNER_COLUMN = {
  expense: 'expense_id',
  mod_plan: 'mod_plan_id',
  timeline_note: 'timeline_note_id',
  service_record: 'service_record_id',
  fuel_log: 'fuel_log_id',
  part: 'part_id',
} as const satisfies Record<AttachmentOwner, string>

/**
 * The storage path for a new upload. The vehicle segment is required by the
 * convention in docs/02-DATA-MODEL.md and a life expense has no vehicle, so it
 * gets a literal segment rather than a collapsed path — a two-segment path would
 * put the object where a vehicle folder is expected.
 */
export function uploadPath(userId: string, vehicleId: string | null, fileId: string): string {
  return `${userId}/${vehicleId ?? 'general'}/${fileId}.webp`
}

/** Alt text derived from context, per the quality floor in docs/03-DESIGN.md. */
export function photoAlt(caption: string | null, context: string): string {
  return caption?.trim() ? caption.trim() : `Photo of ${context}`
}
