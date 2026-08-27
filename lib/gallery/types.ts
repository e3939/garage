/**
 * The gallery's shared shapes and path rules.
 *
 * Client-safe: the upload field is a client component, so nothing here may
 * import `server-only`.
 */

/** The fourth bucket. Private, same path convention as the other three. */
export const GALLERY_BUCKET = 'gallery' as const

/**
 * What the free tier gives you. A plan detail rather than a schema fact, which
 * is why it is here and not in the migration.
 */
export const STORAGE_QUOTA_BYTES = 1024 * 1024 * 1024

/** Past this, the bar changes colour and Settings says so. */
export const STORAGE_WARN_RATIO = 0.85

/** Per-object ceiling, matching `file_size_limit` on the bucket in 0022. */
export const MAX_ORIGINAL_BYTES = 50 * 1024 * 1024

/** What the picker accepts. Wider than the compressed fields: HEIC included. */
export const GALLERY_ACCEPT = 'image/*,.heic,.heif,.dng'

/** Long edge of the grid thumbnail. 160pt at 3x, with a little room. */
export const THUMB_EDGE = 560

/** Thumbnails are the one thing here that is compressed. */
export const THUMB_MAX_MB = 0.06

export type GalleryAlbum = {
  id: string
  name: string
  occurred_on: string | null
  notes: string | null
  photo_count: number
  cover_thumb_url: string | null
}

export type GalleryPhoto = {
  id: string
  album_id: string | null
  album_name: string | null
  storage_path: string
  thumb_path: string | null
  original_filename: string
  content_type: string
  bytes: number
  width: number | null
  height: number | null
  captured_at: string | null
  occurred_on: string
  caption: string | null
  odometer_km: number | null
}

/** A photo plus the URLs a screen needs: the thumbnail, and the original. */
export type GalleryPhotoView = GalleryPhoto & {
  thumb_url: string | null
  original_url: string | null
}

export type StorageUsage = {
  /** Per bucket, so Settings can say where it went. */
  buckets: { bucket_id: string; objects: number; bytes: number }[]
  bytes: number
  objects: number
  quota: number
  ratio: number
}

/**
 * The extension is kept from the original name so a download hands back a file
 * the phone recognises. It is lower-cased and stripped of anything that is not
 * alphanumeric, because it lands in a storage path.
 */
export function originalExtension(filename: string): string {
  const raw = filename.includes('.') ? filename.slice(filename.lastIndexOf('.') + 1) : ''
  const safe = raw.toLowerCase().replace(/[^a-z0-9]/g, '')
  return safe.slice(0, 8) || 'bin'
}

/** `{user_id}/{vehicle_id}/{uuid}.{ext}` — the first segment is what RLS checks. */
export function galleryPath(
  userId: string,
  vehicleId: string,
  fileId: string,
  filename: string,
): string {
  return `${userId}/${vehicleId}/${fileId}.${originalExtension(filename)}`
}

/** The thumbnail sits beside its original, always WebP. */
export function galleryThumbPath(userId: string, vehicleId: string, fileId: string): string {
  return `${userId}/${vehicleId}/${fileId}-thumb.webp`
}

/** "1,2 GB of 1 GB" reads wrong; this rounds the way a person would say it. */
export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  const kb = bytes / 1024
  if (kb < 1024) return `${Math.round(kb)} KB`
  const mb = kb / 1024
  if (mb < 1024) return `${mb < 10 ? mb.toFixed(1) : Math.round(mb)} MB`
  return `${(mb / 1024).toFixed(2)} GB`
}

/** How many more photos fit, at a stated average. Deliberately pessimistic. */
export function photosRemaining(freeBytes: number, averageBytes = 3.5 * 1024 * 1024): number {
  return Math.max(0, Math.floor(freeBytes / averageBytes))
}
