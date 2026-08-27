// Reading files, measuring them, making a thumbnail and uploading are all
// browser work, and none of it can happen on the server.
'use client'

import { useRef, useState } from 'react'

import {
  discardGalleryUploadAction,
  recordGalleryPhotoAction,
} from '@/app/(app)/garage/[vehicleId]/gallery/actions'
import { Button } from '@/components/ui/button'
import { createClient } from '@/lib/supabase/client'
import {
  GALLERY_ACCEPT,
  GALLERY_BUCKET,
  MAX_ORIGINAL_BYTES,
  THUMB_EDGE,
  THUMB_MAX_MB,
  formatBytes,
  galleryPath,
  galleryThumbPath,
  type StorageUsage,
} from '@/lib/gallery/types'

type Stage = 'thumbnailing' | 'uploading' | 'saving' | 'error'
type Progress = { localId: string; name: string; stage: Stage; percent: number; message?: string }

/**
 * The gallery uploader.
 *
 * This is the one place in the app that does **not** compress. Everywhere else
 * a photo is resized and re-encoded before it leaves the phone, because the
 * screen it lands on is 390 points wide. Here the whole point is the original:
 * the file is uploaded byte for byte, HEIC included, and the row records its
 * real filename, dimensions, type and size.
 *
 * A small WebP thumbnail is made alongside it so the grid does not pull
 * megabytes per tile. That is the only derived file, and it can fail without
 * costing anything: making one means drawing the image into a canvas, and only
 * Safari will do that with a HEIC. On the phone this is built for, it works. In
 * a desktop Chrome it does not, and the upload goes ahead with `thumb_path`
 * null and a plain tile in the grid rather than a refusal.
 *
 * The upload goes browser to storage directly. It cannot go through a server
 * action: Vercel caps a function's request body at 4.5MB and a phone photo is
 * routinely more than that.
 */
export function GalleryUpload({
  userId,
  vehicleId,
  albumId,
  today,
  usage,
}: {
  userId: string
  vehicleId: string
  albumId: string | null
  today: string
  usage: StorageUsage
}) {
  const inputRef = useRef<HTMLInputElement | null>(null)
  const [progress, setProgress] = useState<Progress[]>([])
  const [blocked, setBlocked] = useState<string | null>(null)

  const free = Math.max(0, usage.quota - usage.bytes)

  function advance(localId: string, patch: Partial<Progress>) {
    setProgress((rows) =>
      rows.map((row) => (row.localId === localId ? { ...row, ...patch } : row)),
    )
  }

  function clear(localId: string) {
    setProgress((rows) => rows.filter((row) => row.localId !== localId))
  }

  async function handleFiles(files: FileList | null) {
    if (!files || files.length === 0) return
    setBlocked(null)

    const picked = [...files]
    const total = picked.reduce((sum, file) => sum + file.size, 0)

    // Checked before a byte is sent, because the alternative is finding the
    // ceiling by hitting it three photos into a batch.
    if (total > free) {
      setBlocked(
        `That is ${formatBytes(total)} and only ${formatBytes(free)} is left. ` +
          'Remove some photos, or upload fewer at a time.',
      )
      return
    }

    const oversized = picked.find((file) => file.size > MAX_ORIGINAL_BYTES)
    if (oversized) {
      setBlocked(
        `${oversized.name} is ${formatBytes(oversized.size)}. The limit for one file is ` +
          `${formatBytes(MAX_ORIGINAL_BYTES)}.`,
      )
      return
    }

    for (const file of picked) await upload(file)
    if (inputRef.current) inputRef.current.value = ''
  }

  async function upload(file: File) {
    const localId = crypto.randomUUID()
    const fileId = crypto.randomUUID()
    setProgress((rows) => [
      ...rows,
      { localId, name: file.name, stage: 'thumbnailing', percent: 0 },
    ])

    const supabase = createClient()
    const path = galleryPath(userId, vehicleId, fileId, file.name)
    const thumbPath = galleryThumbPath(userId, vehicleId, fileId)
    const written: string[] = []

    try {
      const measured = await measure(file)
      const thumb = await makeThumbnail(file)

      advance(localId, { stage: 'uploading', percent: 10 })

      // The original, untouched. `upsert` stays false so a uuid collision is an
      // error rather than a silent overwrite of someone's photo.
      const { error: originalError } = await supabase.storage
        .from(GALLERY_BUCKET)
        .upload(path, file, { contentType: file.type || 'application/octet-stream', upsert: false })

      if (originalError) throw new Error(originalError.message)
      written.push(path)

      advance(localId, { percent: 70 })

      let storedThumb: string | null = null
      if (thumb) {
        const { error: thumbError } = await supabase.storage
          .from(GALLERY_BUCKET)
          .upload(thumbPath, thumb, { contentType: 'image/webp', upsert: false })
        if (!thumbError) {
          storedThumb = thumbPath
          written.push(thumbPath)
        }
      }

      advance(localId, { stage: 'saving', percent: 90 })

      const result = await recordGalleryPhotoAction({
        id: fileId,
        vehicleId,
        albumId,
        storagePath: path,
        thumbPath: storedThumb,
        originalFilename: file.name,
        contentType: file.type || 'application/octet-stream',
        bytes: file.size,
        width: measured.width,
        height: measured.height,
        capturedAt: file.lastModified ? new Date(file.lastModified).toISOString() : null,
        occurredOn: fileDate(file) ?? today,
        caption: null,
        odometerKm: null,
      })

      if (!result.ok) throw new Error(result.error)
      clear(localId)
    } catch (error) {
      // Whatever landed before the failure is removed, so a half-finished
      // upload does not quietly eat quota.
      if (written.length > 0) await discardGalleryUploadAction(written)
      advance(localId, {
        stage: 'error',
        message: error instanceof Error ? error.message : 'That upload did not finish.',
      })
    }
  }

  return (
    <div className="space-y-3">
      <input
        ref={inputRef}
        type="file"
        accept={GALLERY_ACCEPT}
        multiple
        className="sr-only"
        onChange={(event) => void handleFiles(event.target.files)}
      />

      <Button variant="primary" onClick={() => inputRef.current?.click()}>
        Add photos
      </Button>

      {blocked ? (
        <p role="alert" className="text-label text-critical">
          {blocked}
        </p>
      ) : null}

      {progress.length > 0 ? (
        <ul className="space-y-2">
          {progress.map((row) => (
            <li key={row.localId} className="rounded-md border border-border bg-surface p-3">
              <p className="truncate text-label text-ink">{row.name}</p>
              {row.stage === 'error' ? (
                <p className="text-caption text-critical">{row.message}</p>
              ) : (
                <>
                  <p className="text-caption text-ink-muted">
                    {row.stage === 'thumbnailing'
                      ? 'Reading'
                      : row.stage === 'uploading'
                        ? 'Uploading the original'
                        : 'Saving'}
                  </p>
                  <div className="mt-1 h-1 w-full overflow-hidden rounded-full bg-surface-sunken">
                    <div className="h-full bg-accent" style={{ width: `${row.percent}%` }} />
                  </div>
                </>
              )}
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  )
}

/** Natural dimensions, read without decoding the whole file into a canvas. */
async function measure(file: File): Promise<{ width: number | null; height: number | null }> {
  try {
    if ('createImageBitmap' in globalThis) {
      const bitmap = await createImageBitmap(file)
      const size = { width: bitmap.width, height: bitmap.height }
      bitmap.close()
      return size
    }
  } catch {
    // A format the browser cannot decode. The original is still stored; the
    // dimensions are simply unknown, and the row says so.
  }
  return { width: null, height: null }
}

/**
 * A WebP thumbnail, or null when this browser cannot decode the format. HEIC is
 * the case that matters: Safari can, others cannot.
 */
async function makeThumbnail(file: File): Promise<Blob | null> {
  try {
    const { default: compress } = await import('browser-image-compression')
    return await compress(file, {
      maxWidthOrHeight: THUMB_EDGE,
      maxSizeMB: THUMB_MAX_MB,
      fileType: 'image/webp',
      useWebWorker: true,
    })
  } catch {
    return null
  }
}

/** The file's own date, when the phone kept one, in the app's date format. */
function fileDate(file: File): string | null {
  if (!file.lastModified) return null
  const date = new Date(file.lastModified)
  if (Number.isNaN(date.getTime())) return null
  return date.toISOString().slice(0, 10)
}
