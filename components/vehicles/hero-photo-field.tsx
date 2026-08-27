// Reading a file, compressing it and uploading it are all browser work.
'use client'

import { useEffect, useRef, useState } from 'react'

import { discardVehiclePhotoAction } from '@/app/(app)/garage/actions'
import { Button } from '@/components/ui/button'
import { IMAGE_BUDGETS, MAX_INPUT_BYTES, budgetNote } from '@/lib/images/budgets'

/** docs/02-DATA-MODEL.md: object paths are {user_id}/{vehicle_id}/{uuid}.webp. */
const BUCKET = 'vehicles'

/** Every number that decides how hard this is squeezed. */
const BUDGET = IMAGE_BUDGETS.hero

type Stage = 'idle' | 'compressing' | 'uploading' | 'error'

type HeroPhotoFieldProps = {
  userId: string
  vehicleId: string
  /** What the car is called, for the preview's alt text. Empty on a new one. */
  nickname?: string
  /** The stored path, or null. Owned by the form; this only proposes changes. */
  value: string | null
  /** A signed URL for `value` when it came from the server. */
  initialUrl: string | null
  onChange: (path: string | null) => void
}

/**
 * The hero photo, compressed in the browser before it goes anywhere.
 *
 * A photo straight off a phone is three to eight megabytes of JPEG, and the
 * screen it lands on is 390 points wide. Uploading the original would cost the
 * user their data allowance, cost the app its storage, and cost every later page
 * load the time to send it back down again. So it is resized and re-encoded as
 * WebP before the first byte leaves the device — CLAUDE.md section 2,
 * "Client-side before upload, always".
 *
 * How hard is `IMAGE_BUDGETS.hero`, and it is deliberately the most generous of
 * the three: this is the one image in the app someone actually looks at.
 *
 * The library is imported dynamically, so its weight lands only on the person
 * who actually picks a photo and never in the route's initial JavaScript.
 *
 * The upload goes to its final path before the vehicle row exists. That is safe:
 * the storage policy checks the first path segment against `auth.uid()`, not
 * against any row. A photo picked and then abandoned is removed by
 * `discardVehiclePhotoAction` rather than left to pay rent forever.
 */
export function HeroPhotoField({
  userId,
  vehicleId,
  nickname,
  value,
  initialUrl,
  onChange,
}: HeroPhotoFieldProps) {
  const inputRef = useRef<HTMLInputElement | null>(null)
  const [stage, setStage] = useState<Stage>('idle')
  const [progress, setProgress] = useState(0)
  const [message, setMessage] = useState<string | null>(null)
  const [preview, setPreview] = useState<string | null>(initialUrl)
  /** Paths this session uploaded, so an abandoned one can be cleaned up. */
  const uploaded = useRef<string[]>([])

  // An object URL is a handle on memory, not a string. It has to be given back.
  const objectUrl = useRef<string | null>(null)
  useEffect(() => {
    return () => {
      if (objectUrl.current) URL.revokeObjectURL(objectUrl.current)
    }
  }, [])

  function showLocally(file: Blob) {
    if (objectUrl.current) URL.revokeObjectURL(objectUrl.current)
    objectUrl.current = URL.createObjectURL(file)
    setPreview(objectUrl.current)
  }

  async function pick(file: File) {
    setMessage(null)

    if (file.size > MAX_INPUT_BYTES) {
      setStage('error')
      setMessage('That file is too large to read. Try a photo rather than a raw image.')
      return
    }

    setStage('compressing')
    setProgress(0)

    try {
      // Both of these are imported here rather than at the top of the file, and
      // it is not a style choice: the compression library and the Supabase
      // browser client together are most of a megabyte of JavaScript, and this
      // component sits on the first screen a new user sees. Loaded at the top
      // they would be in the route's initial bundle whether or not anybody ever
      // picks a photo. Loaded here they arrive while the file dialog is open.
      const [{ default: compress }, { createClient }] = await Promise.all([
        import('browser-image-compression'),
        import('@/lib/supabase/client'),
      ])

      const compressed = await compress(file, {
        maxWidthOrHeight: BUDGET.maxEdge,
        maxSizeMB: BUDGET.maxMB,
        fileType: 'image/webp',
        useWebWorker: true,
        onProgress: (percent) => setProgress(percent),
      })

      showLocally(compressed)
      setStage('uploading')

      const path = `${userId}/${vehicleId}/${crypto.randomUUID()}.webp`
      const supabase = createClient()
      const { error } = await supabase.storage.from(BUCKET).upload(path, compressed, {
        contentType: 'image/webp',
        cacheControl: '3600',
        upsert: false,
      })

      if (error) {
        setStage('error')
        setMessage(error.message)
        return
      }

      // The previous upload in this session is now unreferenced.
      const stale = value && uploaded.current.includes(value) ? value : null
      uploaded.current.push(path)
      if (stale) void discardVehiclePhotoAction(stale)

      onChange(path)
      setStage('idle')
      setProgress(100)
    } catch (error) {
      setStage('error')
      setMessage(
        error instanceof Error
          ? error.message
          : 'That image could not be read. Try a JPEG or a PNG.',
      )
    }
  }

  function remove() {
    if (value && uploaded.current.includes(value)) void discardVehiclePhotoAction(value)
    if (objectUrl.current) {
      URL.revokeObjectURL(objectUrl.current)
      objectUrl.current = null
    }
    setPreview(null)
    setStage('idle')
    setMessage(null)
    onChange(null)
    if (inputRef.current) inputRef.current.value = ''
  }

  const busy = stage === 'compressing' || stage === 'uploading'

  return (
    <div className="space-y-2">
      <p className="text-label text-ink-muted" id="vehicle-hero-label">
        Hero photo
      </p>

      {/* The frame is 16:9 whether or not there is an image in it, so nothing
          on the screen moves when one arrives. docs/03-DESIGN.md. */}
      <div
        className="relative w-full overflow-hidden rounded-md border border-border bg-surface-sunken"
        style={{ aspectRatio: '16 / 9' }}
      >
        {preview ? (
          /* The preview is an object URL for a blob that exists only in this
             tab. There is nothing for the image optimiser to fetch and
             next/image cannot serve one, so this is a plain img on purpose. */
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={preview}
            alt={nickname?.trim() ? `Hero photo of ${nickname.trim()}` : 'The photo chosen for this car'}
            className="size-full object-cover"
          />
        ) : (
          <span className="absolute inset-0 flex items-center justify-center px-4 text-center text-caption text-ink-muted">
            No photo yet. One good three-quarter shot is worth more than five.
          </span>
        )}

        {busy ? (
          <span className="absolute inset-x-0 bottom-0 border-t border-border bg-surface px-3 py-2">
            <span className="block text-caption text-ink">
              {stage === 'compressing' ? `Compressing ${Math.round(progress)}%` : 'Uploading'}
            </span>
            <span className="mt-1 block h-1 w-full overflow-hidden rounded-full bg-surface-sunken">
              <span
                className="block h-full bg-accent transition-[width] duration-state ease-enter"
                style={{ width: stage === 'uploading' ? '100%' : `${Math.round(progress)}%` }}
              />
            </span>
          </span>
        ) : null}
      </div>

      <div className="flex items-center gap-2">
        <Button
          size="sm"
          disabled={busy}
          onClick={() => inputRef.current?.click()}
          aria-describedby="vehicle-hero-label"
        >
          {value ? 'Replace photo' : 'Add photo'}
        </Button>
        {value ? (
          <Button size="sm" variant="ghost" disabled={busy} onClick={remove}>
            Remove
          </Button>
        ) : null}
      </div>

      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        className="sr-only"
        aria-hidden
        tabIndex={-1}
        onChange={(event) => {
          const file = event.target.files?.[0]
          if (file) void pick(file)
        }}
      />

      <p className="text-caption text-ink-muted" aria-live="polite">
        {message ?? budgetNote(BUDGET)}
      </p>
    </div>
  )
}
