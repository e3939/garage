import 'server-only'

import { cache } from 'react'

import { createClient } from '@/lib/supabase/server'
import { signedUrl, signedUrls } from '@/lib/storage/signed-url'
import {
  GALLERY_BUCKET,
  STORAGE_QUOTA_BYTES,
  type GalleryAlbum,
  type GalleryPhoto,
  type GalleryPhotoView,
  type StorageUsage,
} from '@/lib/gallery/types'

const PHOTO_COLUMNS =
  'id, album_id, storage_path, thumb_path, original_filename, content_type, bytes, width, height, captured_at, occurred_on, caption, odometer_km'

/**
 * Every photo for a vehicle, newest first, with thumbnail URLs.
 *
 * Both the thumbnail and the original are signed here. Signing looks expensive
 * and is not: `signedUrls` batches a whole bucket into one request, so a page
 * of forty photos costs two round trips in total, not eighty. A signed URL is
 * only a string — nothing is fetched until an `img` asks for it — and having
 * the original ready is what lets the viewer swipe between photos instead of
 * waiting on a round trip per swipe.
 */
export async function fetchGalleryPhotos(vehicleId: string): Promise<GalleryPhotoView[]> {
  const supabase = await createClient()

  const { data, error } = await supabase
    .from('gallery_photos')
    .select(`${PHOTO_COLUMNS}, gallery_albums(name)`)
    .eq('vehicle_id', vehicleId)
    .order('occurred_on', { ascending: false })
    .order('created_at', { ascending: false })

  if (error) throw new Error(`gallery_photos failed: ${error.message}`)

  const rows = (data ?? []).map((row) => {
    const { gallery_albums, ...rest } = row as typeof row & {
      gallery_albums: { name: string } | null
    }
    return { ...rest, album_name: gallery_albums?.name ?? null } as GalleryPhoto
  })

  const [thumbs, originals] = await Promise.all([
    signedUrls(
      GALLERY_BUCKET,
      rows.map((row) => row.thumb_path),
    ),
    signedUrls(
      GALLERY_BUCKET,
      rows.map((row) => row.storage_path),
    ),
  ])

  return rows.map((row, index) => ({
    ...row,
    thumb_url: thumbs[index] ?? null,
    original_url: originals[index] ?? null,
  }))
}

/** One photo with its original signed, for the viewer and for Download. */
export async function fetchGalleryPhoto(photoId: string): Promise<GalleryPhotoView | null> {
  const supabase = await createClient()

  const { data, error } = await supabase
    .from('gallery_photos')
    .select(`${PHOTO_COLUMNS}, gallery_albums(name)`)
    .eq('id', photoId)
    .maybeSingle()

  if (error) throw new Error(`gallery_photos failed: ${error.message}`)
  if (!data) return null

  const { gallery_albums, ...rest } = data as typeof data & {
    gallery_albums: { name: string } | null
  }
  const row = { ...rest, album_name: gallery_albums?.name ?? null } as GalleryPhoto

  const [thumb, original] = await Promise.all([
    signedUrl(GALLERY_BUCKET, row.thumb_path),
    signedUrl(GALLERY_BUCKET, row.storage_path),
  ])

  return { ...row, thumb_url: thumb, original_url: original }
}

/**
 * The albums for a vehicle, each with its photo count and a cover.
 *
 * The cover is the newest photo in the album that has a thumbnail — an album
 * whose only photos are HEICs uploaded from a desktop browser has no cover, and
 * shows as a plain tile rather than a broken one.
 */
export async function fetchGalleryAlbums(vehicleId: string): Promise<GalleryAlbum[]> {
  const supabase = await createClient()

  const [albumsResult, photosResult] = await Promise.all([
    supabase
      .from('gallery_albums')
      .select('id, name, occurred_on, notes')
      .eq('vehicle_id', vehicleId)
      .order('occurred_on', { ascending: false, nullsFirst: false })
      .order('created_at', { ascending: false }),
    supabase
      .from('gallery_photos')
      .select('album_id, thumb_path, occurred_on, created_at')
      .eq('vehicle_id', vehicleId)
      .not('album_id', 'is', null)
      .order('occurred_on', { ascending: false })
      .order('created_at', { ascending: false }),
  ])

  if (albumsResult.error) throw new Error(`gallery_albums failed: ${albumsResult.error.message}`)
  if (photosResult.error) throw new Error(`gallery_photos failed: ${photosResult.error.message}`)

  const counts = new Map<string, number>()
  const covers = new Map<string, string>()
  for (const photo of photosResult.data ?? []) {
    const albumId = photo.album_id
    if (!albumId) continue
    counts.set(albumId, (counts.get(albumId) ?? 0) + 1)
    if (!covers.has(albumId) && photo.thumb_path) covers.set(albumId, photo.thumb_path)
  }

  const albums = albumsResult.data ?? []
  const coverUrls = await signedUrls(
    GALLERY_BUCKET,
    albums.map((album) => covers.get(album.id) ?? null),
  )

  return albums.map((album, index) => ({
    ...album,
    photo_count: counts.get(album.id) ?? 0,
    cover_thumb_url: coverUrls[index] ?? null,
  }))
}

/**
 * What the plan's storage is being spent on.
 *
 * Read from `v_storage_usage`, which sums `storage.objects` under the caller's
 * own policies, so this is real usage rather than the sum of the rows this app
 * happens to know about — an orphaned object still counts against the quota and
 * should still be visible here.
 *
 * `cache()` because the gallery screen and the shell both want it.
 */
export const fetchStorageUsage = cache(async function fetchStorageUsage(): Promise<StorageUsage> {
  const supabase = await createClient()

  const { data, error } = await supabase
    .from('v_storage_usage')
    .select('bucket_id, objects, bytes')

  if (error) throw new Error(`v_storage_usage failed: ${error.message}`)

  const buckets = (data ?? []).map((row) => ({
    bucket_id: row.bucket_id ?? 'unknown',
    objects: Number(row.objects ?? 0),
    bytes: Number(row.bytes ?? 0),
  }))

  const bytes = buckets.reduce((sum, row) => sum + row.bytes, 0)
  const objects = buckets.reduce((sum, row) => sum + row.objects, 0)

  return {
    buckets: buckets.sort((a, b) => b.bytes - a.bytes),
    bytes,
    objects,
    quota: STORAGE_QUOTA_BYTES,
    ratio: STORAGE_QUOTA_BYTES === 0 ? 0 : bytes / STORAGE_QUOTA_BYTES,
  }
})
