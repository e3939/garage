'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'

import { createClient } from '@/lib/supabase/server'
import { forgetSignedUrl, signedUrl } from '@/lib/storage/signed-url'
import { GALLERY_BUCKET } from '@/lib/gallery/types'

/**
 * Writes for the gallery.
 *
 * The upload itself is not here. A phone photo is three to five megabytes and a
 * Vercel serverless function will not accept a request body over 4.5MB, so the
 * file goes from the browser straight to Supabase Storage under the policy that
 * checks the first path segment. These actions record what landed, and clean up
 * after what did not.
 */

export type GalleryResult = { ok: true } | { ok: false; error: string }

const uuid = z.uuid()

const photoSchema = z.object({
  id: uuid,
  vehicleId: uuid,
  albumId: uuid.nullable(),
  storagePath: z.string().min(1),
  thumbPath: z.string().min(1).nullable(),
  originalFilename: z.string().min(1).max(300),
  contentType: z.string().min(1).max(100),
  bytes: z.number().int().positive(),
  width: z.number().int().positive().nullable(),
  height: z.number().int().positive().nullable(),
  capturedAt: z.string().nullable(),
  occurredOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  caption: z.string().max(500).nullable(),
  odometerKm: z.number().int().nonnegative().nullable(),
})

export type GalleryPhotoWrite = z.infer<typeof photoSchema>

function refresh(vehicleId: string) {
  revalidatePath(`/garage/${vehicleId}/gallery`)
  revalidatePath(`/garage/${vehicleId}`)
  revalidatePath('/settings')
}

/** Records an object that is already in the bucket. */
export async function recordGalleryPhotoAction(input: GalleryPhotoWrite): Promise<GalleryResult> {
  const parsed = photoSchema.safeParse(input)
  if (!parsed.success) return { ok: false, error: 'That photo could not be saved.' }

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { ok: false, error: 'Sign in again to save this photo.' }

  const p = parsed.data
  const { error } = await supabase.from('gallery_photos').insert({
    id: p.id,
    user_id: user.id,
    vehicle_id: p.vehicleId,
    album_id: p.albumId,
    storage_path: p.storagePath,
    thumb_path: p.thumbPath,
    original_filename: p.originalFilename,
    content_type: p.contentType,
    bytes: p.bytes,
    width: p.width,
    height: p.height,
    captured_at: p.capturedAt,
    occurred_on: p.occurredOn,
    caption: p.caption,
    odometer_km: p.odometerKm,
  })

  if (error) return { ok: false, error: 'That photo could not be saved.' }

  refresh(p.vehicleId)
  return { ok: true }
}

const editSchema = z.object({
  id: uuid,
  vehicleId: uuid,
  albumId: uuid.nullable(),
  caption: z.string().max(500).nullable(),
  occurredOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  odometerKm: z.number().int().nonnegative().nullable(),
})

export async function updateGalleryPhotoAction(
  input: z.infer<typeof editSchema>,
): Promise<GalleryResult> {
  const parsed = editSchema.safeParse(input)
  if (!parsed.success) return { ok: false, error: 'That change could not be saved.' }

  const supabase = await createClient()
  const p = parsed.data
  const { error } = await supabase
    .from('gallery_photos')
    .update({
      album_id: p.albumId,
      caption: p.caption,
      occurred_on: p.occurredOn,
      odometer_km: p.odometerKm,
    })
    .eq('id', p.id)

  if (error) return { ok: false, error: 'That change could not be saved.' }

  refresh(p.vehicleId)
  return { ok: true }
}

/**
 * Deletes photos and the objects behind them.
 *
 * Storage first, then the rows. The other order can leave a row pointing at
 * nothing, which renders as a broken tile; this order can at worst leave an
 * object with no row, which is invisible but still counts against the quota —
 * and `v_storage_usage` reads storage rather than the rows, so it stays honest
 * about that rather than under-reporting.
 */
export async function deleteGalleryPhotosAction(
  vehicleId: string,
  photoIds: string[],
): Promise<GalleryResult> {
  const ids = z.array(uuid).min(1).max(200).safeParse(photoIds)
  if (!ids.success) return { ok: false, error: 'Nothing selected.' }

  const supabase = await createClient()

  const { data: rows, error: readError } = await supabase
    .from('gallery_photos')
    .select('id, storage_path, thumb_path')
    .in('id', ids.data)

  if (readError) return { ok: false, error: 'Those photos could not be removed.' }
  if (!rows || rows.length === 0) return { ok: true }

  const paths = rows.flatMap((row) =>
    [row.storage_path, row.thumb_path].filter((path): path is string => Boolean(path)),
  )

  await supabase.storage.from(GALLERY_BUCKET).remove(paths)
  for (const path of paths) forgetSignedUrl(GALLERY_BUCKET, path)

  const { error } = await supabase
    .from('gallery_photos')
    .delete()
    .in(
      'id',
      rows.map((row) => row.id),
    )

  if (error) return { ok: false, error: 'Those photos could not be removed.' }

  refresh(vehicleId)
  return { ok: true }
}

/** Removes an object uploaded for a photo that was then abandoned. */
export async function discardGalleryUploadAction(paths: string[]): Promise<void> {
  const parsed = z.array(z.string().min(1)).max(10).safeParse(paths)
  if (!parsed.success || parsed.data.length === 0) return

  const supabase = await createClient()
  await supabase.storage.from(GALLERY_BUCKET).remove(parsed.data)
  for (const path of parsed.data) forgetSignedUrl(GALLERY_BUCKET, path)
}

const albumSchema = z.object({
  vehicleId: uuid,
  name: z.string().trim().min(1, 'Name the album.').max(120),
  occurredOn: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .nullable(),
  notes: z.string().max(1000).nullable(),
})

export async function createAlbumAction(
  input: z.infer<typeof albumSchema>,
): Promise<GalleryResult & { id?: string }> {
  const parsed = albumSchema.safeParse(input)
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? 'Name the album.' }
  }

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { ok: false, error: 'Sign in again to make an album.' }

  const p = parsed.data
  const { data, error } = await supabase
    .from('gallery_albums')
    .insert({
      user_id: user.id,
      vehicle_id: p.vehicleId,
      name: p.name,
      occurred_on: p.occurredOn,
      notes: p.notes,
    })
    .select('id')
    .single()

  if (error) {
    // The unique index is on the trimmed, lower-cased name per vehicle.
    const duplicate = error.code === '23505'
    return {
      ok: false,
      error: duplicate ? 'There is already an album with that name.' : 'That album could not be made.',
    }
  }

  refresh(p.vehicleId)
  return { ok: true, id: data.id }
}

/**
 * Deletes an album, never its photos. `on delete set null` on the foreign key
 * means the photos come loose rather than disappearing with the folder they
 * happened to be filed under.
 */
export async function deleteAlbumAction(
  vehicleId: string,
  albumId: string,
): Promise<GalleryResult> {
  const parsed = uuid.safeParse(albumId)
  if (!parsed.success) return { ok: false, error: 'That album could not be removed.' }

  const supabase = await createClient()
  const { error } = await supabase.from('gallery_albums').delete().eq('id', parsed.data)

  if (error) return { ok: false, error: 'That album could not be removed.' }

  refresh(vehicleId)
  return { ok: true }
}

/**
 * A fresh signed URL for one original, for Download and for the full-screen
 * view. Signed on demand rather than with the grid: forty originals signed to
 * render forty thumbnails is the thumbnail's whole purpose spent.
 */
export async function signOriginalAction(photoId: string): Promise<string | null> {
  const parsed = uuid.safeParse(photoId)
  if (!parsed.success) return null

  const supabase = await createClient()
  const { data, error } = await supabase
    .from('gallery_photos')
    .select('storage_path')
    .eq('id', parsed.data)
    .maybeSingle()

  if (error || !data) return null
  return signedUrl(GALLERY_BUCKET, data.storage_path)
}
