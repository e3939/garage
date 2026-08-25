// Reading files, compressing them, uploading them and reordering them are all
// browser work, and none of it can happen on the server.
'use client'

import { useEffect, useRef, useState } from 'react'

import { discardUploadAction } from '@/app/(app)/attachments/actions'
import { Button } from '@/components/ui/button'
import { INPUT_CLASS } from '@/components/ui/field'
import { Thumbnail } from '@/components/attachments/thumbnail'
import {
  ATTACHMENT_TARGET,
  uploadPath,
  type AttachmentDraft,
  type AttachmentOwner,
  type AttachmentView,
} from '@/lib/attachments/types'

/** Long edge in pixels. A phone screen is 390pt; 1600 survives a pinch zoom. */
const MAX_EDGE = 1600

/** Roughly 400KB of WebP. The library takes megabytes. */
const MAX_MB = 0.4

/** Bigger than this and something has gone wrong before we ever see it. */
const MAX_INPUT_BYTES = 32 * 1024 * 1024

/** The list schema's ceiling. Twelve photos is a thorough day in the garage. */
const MAX_PHOTOS = 12

/**
 * How many files are compressed at once.
 *
 * Compression is CPU-bound and runs in a worker; three at a time on a mid-range
 * phone keeps the main thread responsive and still overlaps each file's upload
 * — which is network-bound — with the next file's compression. All eight of a
 * batch at once simply queues them on one core and makes every progress bar
 * move at an eighth of the speed.
 */
const LANES = 3

type Progress = {
  localId: string
  name: string
  previewUrl: string
  stage: 'compressing' | 'uploading' | 'error'
  percent: number
  message?: string
}

export type AttachmentFieldProps = {
  userId: string
  /** The car these photos are of, and the second segment of the object path. */
  vehicleId: string | null
  owner: AttachmentOwner
  value: readonly AttachmentDraft[]
  onChange: (next: AttachmentDraft[]) => void
  /** Signed URLs for photos that came from the server, keyed by attachment id. */
  urls?: Readonly<Record<string, string | null>>
  /** Names what is in the pictures, for alt text on the ones with no caption. */
  context: string
  label?: string
}

/** Run a list through a worker with at most `lanes` of it in flight. */
async function pool<T>(items: readonly T[], lanes: number, work: (item: T) => Promise<void>) {
  let next = 0
  const runners = Array.from({ length: Math.min(lanes, items.length) }, async () => {
    for (;;) {
      const index = next
      next += 1
      const item = items[index]
      if (item === undefined) return
      await work(item)
    }
  })
  await Promise.all(runners)
}

/** The pixel size of a blob, read from the browser's own decoder. */
function measure(url: string): Promise<{ width: number; height: number } | null> {
  return new Promise((resolve) => {
    const image = new window.Image()
    image.onload = () => resolve({ width: image.naturalWidth, height: image.naturalHeight })
    image.onerror = () => resolve(null)
    image.src = url
  })
}

/**
 * The photo field. One component, used by every entity that has photos.
 *
 * It owns storage and nothing else: the files go up while the sheet is open, and
 * the list of metadata it hands back is written to `attachments` by whichever
 * action saves the record. That split is what makes a save feel instant — the
 * slow part happened while the user was still typing a note — and it is why an
 * abandoned upload is cleaned up here rather than left for a sweep.
 *
 * `browser-image-compression` and the Supabase browser client are imported at
 * the moment a file is picked, not at the top of the file. Together they are
 * most of a megabyte, and this field sits inside the quick-add sheet, which is
 * on every screen with a FAB.
 */
export function AttachmentField({
  userId,
  vehicleId,
  owner,
  value,
  onChange,
  urls,
  context,
  label = 'Photos',
}: AttachmentFieldProps) {
  const input = useRef<HTMLInputElement | null>(null)
  const [progress, setProgress] = useState<Progress[]>([])
  /**
   * Blob URLs for photos uploaded in this session, keyed by attachment id. A
   * photo that has just gone up has no signed URL yet — signing happens on the
   * server, on the next render — and showing nothing in the meantime would read
   * as a failed upload.
   */
  const [localUrls, setLocalUrls] = useState<Record<string, string>>({})
  const [error, setError] = useState<string | null>(null)

  /** Paths uploaded in this session, so an abandoned one can be taken back. */
  const uploaded = useRef<string[]>([])
  /** Object URLs are handles on memory and have to be given back. */
  const objectUrls = useRef<string[]>([])

  useEffect(() => {
    const urlsHeld = objectUrls.current
    return () => {
      for (const url of urlsHeld) URL.revokeObjectURL(url)
    }
  }, [])

  const target = ATTACHMENT_TARGET[owner]
  const busy = progress.some((entry) => entry.stage !== 'error')
  const room = MAX_PHOTOS - value.length

  function track(entry: Progress) {
    setProgress((previous) => [...previous, entry])
  }

  function advance(localId: string, patch: Partial<Progress>) {
    setProgress((previous) =>
      previous.map((entry) => (entry.localId === localId ? { ...entry, ...patch } : entry)),
    )
  }

  function forget(localId: string) {
    setProgress((previous) => previous.filter((entry) => entry.localId !== localId))
  }

  async function accept(files: File[]) {
    setError(null)

    if (files.length > room) {
      setError(`Room for ${room} more. The first ${room} were taken.`)
      files = files.slice(0, Math.max(0, room))
    }
    if (files.length === 0) return

    const [{ default: compress }, { createClient }] = await Promise.all([
      import('browser-image-compression'),
      import('@/lib/supabase/client'),
    ])
    const supabase = createClient()

    // A running index, so a batch of five lands in the order it was picked
    // rather than in the order the network finished with it.
    let order = value.length
    const added: AttachmentDraft[] = []

    await pool(files, LANES, async (file) => {
      const localId = crypto.randomUUID()
      const previewUrl = URL.createObjectURL(file)
      objectUrls.current.push(previewUrl)
      const position = order
      order += 1

      track({ localId, name: file.name, previewUrl, stage: 'compressing', percent: 0 })

      if (file.size > MAX_INPUT_BYTES) {
        advance(localId, {
          stage: 'error',
          message: 'Too large to read. Try a photo rather than a raw image.',
        })
        return
      }

      try {
        const compressed = await compress(file, {
          maxWidthOrHeight: MAX_EDGE,
          maxSizeMB: MAX_MB,
          fileType: 'image/webp',
          useWebWorker: true,
          onProgress: (percent) => advance(localId, { percent }),
        })

        advance(localId, { stage: 'uploading', percent: 100 })

        const id = crypto.randomUUID()
        const path = uploadPath(userId, vehicleId, id)
        const { error: uploadError } = await supabase.storage
          .from(target.bucket)
          .upload(path, compressed, {
            contentType: 'image/webp',
            cacheControl: '3600',
            upsert: false,
          })

        if (uploadError) {
          advance(localId, { stage: 'error', message: uploadError.message })
          return
        }

        uploaded.current.push(path)
        setLocalUrls((previous) => ({ ...previous, [id]: previewUrl }))
        const size = await measure(previewUrl)

        added.push({
          id,
          storage_path: path,
          bucket_name: target.bucket,
          kind: target.kind,
          width: size?.width ?? null,
          height: size?.height ?? null,
          bytes: compressed.size,
          caption: null,
          sort_order: position,
        })

        forget(localId)
      } catch (thrown) {
        advance(localId, {
          stage: 'error',
          message:
            thrown instanceof Error
              ? thrown.message
              : 'That image could not be read. Try a JPEG or a PNG.',
        })
      }
    })

    if (added.length > 0) {
      added.sort((a, b) => a.sort_order - b.sort_order)
      onChange(renumber([...value, ...added]))
    }
  }

  function renumber(list: readonly AttachmentDraft[]): AttachmentDraft[] {
    return list.map((draft, index) => ({ ...draft, sort_order: index }))
  }

  function move(index: number, delta: number) {
    const next = [...value]
    const swapWith = index + delta
    const held = next[index]
    const other = next[swapWith]
    if (!held || !other) return
    next[index] = other
    next[swapWith] = held
    onChange(renumber(next))
  }

  function remove(index: number) {
    const gone = value[index]
    if (!gone) return
    // A file this session put in storage and the user has now taken out has no
    // row and never will, so it goes. One that arrived from the server is left
    // alone here — the sync on save is what deletes it, and only once the save
    // actually happens.
    if (uploaded.current.includes(gone.storage_path)) {
      void discardUploadAction(gone.bucket_name, gone.storage_path)
    }
    onChange(renumber(value.filter((_, position) => position !== index)))
  }

  function caption(index: number, text: string) {
    onChange(
      value.map((draft, position) =>
        position === index ? { ...draft, caption: text === '' ? null : text } : draft,
      ),
    )
  }

  /** A stored photo has a signed URL; one just uploaded has a local blob. */
  function urlFor(draft: AttachmentDraft): string | null {
    return urls?.[draft.id] ?? localUrls[draft.id] ?? null
  }

  return (
    <div className="space-y-2">
      <p className="text-label text-ink-muted" id={`${owner}-photos-label`}>
        {label}
      </p>

      {value.length > 0 ? (
        <ul className="space-y-2">
          {value.map((draft, index) => (
            <li
              key={draft.id}
              className="flex items-start gap-3 rounded-md border border-border bg-surface p-2"
            >
              <PhotoPreview draft={draft} url={urlFor(draft)} context={context} />

              <div className="min-w-0 flex-1 space-y-2">
                <input
                  aria-label={`Caption for photo ${index + 1}`}
                  className={`${INPUT_CLASS} text-input`}
                  placeholder="Caption"
                  value={draft.caption ?? ''}
                  onChange={(event) => caption(index, event.target.value)}
                />
                <div className="flex flex-wrap items-center gap-1">
                  <SmallButton
                    disabled={index === 0}
                    onClick={() => move(index, -1)}
                    label={`Move photo ${index + 1} earlier`}
                  >
                    Earlier
                  </SmallButton>
                  <SmallButton
                    disabled={index === value.length - 1}
                    onClick={() => move(index, 1)}
                    label={`Move photo ${index + 1} later`}
                  >
                    Later
                  </SmallButton>
                  <SmallButton
                    onClick={() => remove(index)}
                    label={`Remove photo ${index + 1}`}
                    tone="critical"
                  >
                    Remove
                  </SmallButton>
                </div>
              </div>
            </li>
          ))}
        </ul>
      ) : null}

      {progress.length > 0 ? (
        <ul className="space-y-2" aria-live="polite">
          {progress.map((entry) => (
            <li
              key={entry.localId}
              className="flex items-center gap-3 rounded-md border border-border bg-surface p-2"
            >
              {/* An object URL points at a blob in this tab. There is nothing
                  for the image optimiser to fetch, so this is a plain img. */}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={entry.previewUrl}
                alt=""
                width={56}
                height={56}
                className="size-[56px] shrink-0 rounded-sm object-cover"
              />
              <div className="min-w-0 flex-1">
                <p className="truncate text-caption text-ink">
                  {entry.stage === 'error'
                    ? (entry.message ?? 'That photo could not be added.')
                    : entry.stage === 'compressing'
                      ? `Compressing ${Math.round(entry.percent)}%`
                      : 'Uploading'}
                </p>
                {entry.stage === 'error' ? null : (
                  <span className="mt-1 block h-1 w-full overflow-hidden rounded-full bg-surface-sunken">
                    <span
                      className="block h-full bg-accent transition-[width] duration-state ease-enter"
                      style={{
                        width:
                          entry.stage === 'uploading' ? '100%' : `${Math.round(entry.percent)}%`,
                      }}
                    />
                  </span>
                )}
              </div>
              {entry.stage === 'error' ? (
                <SmallButton onClick={() => forget(entry.localId)} label="Dismiss">
                  Dismiss
                </SmallButton>
              ) : null}
            </li>
          ))}
        </ul>
      ) : null}

      <div className="flex items-center gap-2">
        <Button
          size="sm"
          disabled={busy || room <= 0}
          onClick={() => input.current?.click()}
          aria-describedby={`${owner}-photos-label`}
        >
          {value.length > 0 ? 'Add more photos' : 'Add photos'}
        </Button>
      </div>

      <input
        ref={input}
        type="file"
        accept="image/*"
        multiple
        className="sr-only"
        aria-hidden
        tabIndex={-1}
        onChange={(event) => {
          const files = [...(event.target.files ?? [])]
          event.target.value = ''
          if (files.length > 0) void accept(files)
        }}
      />

      <p className="text-caption text-ink-muted">
        {error ??
          `Resized to ${MAX_EDGE}px and re-encoded as WebP on this device before anything is sent.`}
      </p>
    </div>
  )
}

type PhotoPreviewProps = {
  draft: AttachmentDraft
  url: string | null
  context: string
}

/**
 * The torn-edge treatment, in the form as well as in the feed: the photo you are
 * about to attach should look like the photo you will see attached.
 */
function PhotoPreview({ draft, url, context }: PhotoPreviewProps) {
  const view: AttachmentView = { ...draft, url }
  return <Thumbnail url={view.url} id={draft.id} caption={draft.caption} context={context} size={64} />
}

type SmallButtonProps = {
  children: string
  label: string
  onClick: () => void
  disabled?: boolean
  tone?: 'default' | 'critical'
}

/** Small enough to sit three across a phone, still 44px of touch target. */
function SmallButton({ children, label, onClick, disabled, tone = 'default' }: SmallButtonProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      className={[
        'min-h-touch rounded-md px-3 text-label',
        tone === 'critical' ? 'text-critical' : 'text-ink-muted',
        'disabled:pointer-events-none disabled:opacity-50',
      ].join(' ')}
    >
      {children}
    </button>
  )
}
