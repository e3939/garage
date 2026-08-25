import 'server-only'

import { createClient } from '@/lib/supabase/server'
import type { AttachmentDraft, AttachmentView, StorageBucket } from '@/lib/attachments/types'

/**
 * Signed URLs for private storage objects, cached.
 *
 * All three buckets are private (docs/02-DATA-MODEL.md), so every image on a
 * screen needs a URL signed server-side with a one-hour TTL. Signing is a round
 * trip to the storage API, and a garage list of five cars would otherwise make
 * five of them on every render, on every navigation, for images that have not
 * changed.
 *
 * So the URL is held until shortly before it expires. The cache key is the
 * object's path, which begins with its owner's user id — that is what the RLS
 * policy on `storage.objects` checks — so one user's URL can never be handed to
 * another: the path they would have to ask for is one they cannot see the row
 * for in the first place.
 *
 * The cache is process-local and deliberately dumb. It is a memo, not a store:
 * losing it costs one round trip.
 */

export type { StorageBucket } from '@/lib/attachments/types'

/** docs/02-DATA-MODEL.md: "signed URLs with a 1-hour TTL". */
const TTL_SECONDS = 60 * 60

/** Re-sign this far before expiry, so a URL never dies mid-page-load. */
const REFRESH_MARGIN_MS = 5 * 60 * 1000

/** A ceiling, so a long-lived process cannot grow this without bound. */
const MAX_ENTRIES = 500

type Entry = { url: string; expiresAt: number }

const cache = new Map<string, Entry>()

function keyOf(bucket: StorageBucket, path: string): string {
  return `${bucket}/${path}`
}

function fresh(key: string, now: number): string | null {
  const entry = cache.get(key)
  if (!entry) return null
  if (entry.expiresAt - REFRESH_MARGIN_MS <= now) {
    cache.delete(key)
    return null
  }
  return entry.url
}

function remember(key: string, url: string, now: number): void {
  if (cache.size >= MAX_ENTRIES) {
    // Oldest insertion first: Map preserves insertion order, and every entry has
    // the same TTL, so the first key is also the one closest to expiring.
    const oldest = cache.keys().next()
    if (!oldest.done) cache.delete(oldest.value)
  }
  cache.set(key, { url, expiresAt: now + TTL_SECONDS * 1000 })
}

/**
 * One signed URL. Null when the object cannot be signed — a path that no longer
 * exists, or one the caller does not own. A missing image is an image that does
 * not render; it is never an error page.
 */
export async function signedUrl(bucket: StorageBucket, path: string | null): Promise<string | null> {
  if (!path) return null
  const [only] = await signedUrls(bucket, [path])
  return only ?? null
}

/**
 * Several at once, in the order asked for. Whatever is already cached is
 * answered from memory and only the rest is signed, in a single request.
 */
export async function signedUrls(
  bucket: StorageBucket,
  paths: readonly (string | null)[],
): Promise<(string | null)[]> {
  const now = Date.now()
  const results: (string | null)[] = paths.map((path) =>
    path ? fresh(keyOf(bucket, path), now) : null,
  )

  const missing = [
    ...new Set(
      paths.filter((path, index): path is string => Boolean(path) && results[index] === null),
    ),
  ]
  if (missing.length === 0) return results

  const supabase = await createClient()
  const { data, error } = await supabase.storage.from(bucket).createSignedUrls(missing, TTL_SECONDS)

  if (error || !data) return results

  const signed = new Map<string, string>()
  for (const entry of data) {
    if (!entry.signedUrl || entry.error) continue
    // The API echoes the path back on `path`; fall back to nothing rather than
    // guessing, because a URL matched to the wrong row is worse than no image.
    const path = entry.path
    if (!path) continue
    signed.set(path, entry.signedUrl)
    remember(keyOf(bucket, path), entry.signedUrl, now)
  }

  return paths.map((path, index) => {
    if (results[index]) return results[index] ?? null
    if (!path) return null
    return signed.get(path) ?? null
  })
}

/**
 * Drop a path from the cache. Called after a photo is replaced, so the old URL
 * is not served for the rest of its hour against an object that has changed.
 */
export function forgetSignedUrl(bucket: StorageBucket, path: string | null): void {
  if (path) cache.delete(keyOf(bucket, path))
}


/**
 * Sign a whole page of the feed at once.
 *
 * A month of activity is thirty rows and can be a hundred photos, and signing
 * them one at a time would be a hundred round trips before the first pixel. The
 * storage API signs a batch per bucket, so the set is grouped by bucket and each
 * group costs exactly one request — usually one in total, because a feed's
 * photos are nearly always receipts or nearly always progress shots.
 *
 * Anything already in the cache is answered from memory and never asked for, so
 * paging further down a feed re-signs only what is new.
 */
export async function signAttachments(
  attachments: readonly AttachmentDraft[],
): Promise<AttachmentView[]> {
  const byBucket = new Map<StorageBucket, string[]>()
  for (const attachment of attachments) {
    const paths = byBucket.get(attachment.bucket_name) ?? []
    paths.push(attachment.storage_path)
    byBucket.set(attachment.bucket_name, paths)
  }

  const urls = new Map<string, string>()
  await Promise.all(
    [...byBucket].map(async ([bucket, paths]) => {
      const signed = await signedUrls(bucket, paths)
      paths.forEach((path, index) => {
        const url = signed[index]
        if (url) urls.set(`${bucket}/${path}`, url)
      })
    }),
  )

  return attachments.map((attachment) => ({
    ...attachment,
    url: urls.get(`${attachment.bucket_name}/${attachment.storage_path}`) ?? null,
  }))
}
