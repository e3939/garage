// The grid, the selection, the viewer and the album filter are all client state.
'use client'

import { useMemo, useState } from 'react'

import {
  createAlbumAction,
  deleteAlbumAction,
  deleteGalleryPhotosAction,
  signOriginalAction,
} from '@/app/(app)/garage/[vehicleId]/gallery/actions'
import { PhotoViewer } from '@/components/attachments/photo-viewer'
import { GalleryUpload } from '@/components/gallery/gallery-upload'
import { Camera, ICON_EMPTY, ICON_UI } from '@/components/icons'
import { Button } from '@/components/ui/button'
import { INPUT_CLASS } from '@/components/ui/field'
import { useToast } from '@/components/ui/toast'
import type { AttachmentView } from '@/lib/attachments/types'
import { dateLabel } from '@/lib/dates-display'
import {
  formatBytes,
  type GalleryAlbum,
  type GalleryPhotoView,
  type StorageUsage,
} from '@/lib/gallery/types'

type GalleryScreenProps = {
  userId: string
  vehicleId: string
  vehicleName: string
  photos: GalleryPhotoView[]
  albums: GalleryAlbum[]
  usage: StorageUsage
  today: string
}

/**
 * The gallery.
 *
 * Grid of thumbnails, tap to open the original full-screen, long-press or the
 * Select button for multi-select, and a Download that hands back the untouched
 * file rather than anything this app made.
 *
 * Downloading goes through a fresh signed URL per photo rather than a stored
 * one: a signed URL lives an hour, a grid can sit open longer than that, and a
 * download that fails because the page was left open is a bad way to find out.
 */
export function GalleryScreen({
  userId,
  vehicleId,
  vehicleName,
  photos,
  albums,
  usage,
  today,
}: GalleryScreenProps) {
  const toast = useToast()
  const [albumFilter, setAlbumFilter] = useState<string | 'all' | 'loose'>('all')
  const [selection, setSelection] = useState<Set<string>>(new Set())
  const [selecting, setSelecting] = useState(false)
  const [viewing, setViewing] = useState(-1)
  const [newAlbum, setNewAlbum] = useState('')
  const [busy, setBusy] = useState(false)

  const visible = useMemo(() => {
    if (albumFilter === 'all') return photos
    if (albumFilter === 'loose') return photos.filter((photo) => photo.album_id === null)
    return photos.filter((photo) => photo.album_id === albumFilter)
  }, [photos, albumFilter])

  /**
   * The viewer's own shape. Everything it needs is already on the row; the
   * fields it does not use are filled in rather than made optional, because
   * `AttachmentView` is the contract six other screens share.
   */
  const viewerPhotos: AttachmentView[] = useMemo(
    () =>
      visible.map((photo, position) => ({
        id: photo.id,
        storage_path: photo.storage_path,
        bucket_name: 'gallery' as const,
        kind: 'progress' as const,
        width: photo.width,
        height: photo.height,
        bytes: photo.bytes,
        caption: photo.caption,
        sort_order: position,
        url: photo.original_url,
      })),
    [visible],
  )

  const selectedPhotos = photos.filter((photo) => selection.has(photo.id))
  const selectedBytes = selectedPhotos.reduce((sum, photo) => sum + photo.bytes, 0)

  function toggle(id: string) {
    setSelection((previous) => {
      const next = new Set(previous)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  /**
   * One at a time, on purpose. A browser will silently drop all but the first
   * of a burst of programmatic downloads, so a bulk download of twelve photos
   * that fires twelve clicks in a loop delivers one photo and looks broken.
   */
  async function download(items: GalleryPhotoView[]) {
    setBusy(true)
    let delivered = 0
    for (const photo of items) {
      const url = await signOriginalAction(photo.id)
      if (!url) continue
      const anchor = document.createElement('a')
      anchor.href = url
      anchor.download = photo.original_filename
      anchor.rel = 'noopener'
      document.body.append(anchor)
      anchor.click()
      anchor.remove()
      delivered += 1
      await new Promise((resolve) => setTimeout(resolve, 600))
    }
    setBusy(false)
    toast.show(
      delivered === items.length
        ? `${delivered} ${delivered === 1 ? 'photo' : 'photos'} downloaded`
        : `${delivered} of ${items.length} downloaded`,
    )
  }

  async function removeSelected() {
    const ids = [...selection]
    if (ids.length === 0) return
    setBusy(true)
    const result = await deleteGalleryPhotosAction(vehicleId, ids)
    setBusy(false)
    if (!result.ok) {
      toast.show(result.error)
      return
    }
    setSelection(new Set())
    setSelecting(false)
    toast.show(`${ids.length} ${ids.length === 1 ? 'photo' : 'photos'} removed`)
  }

  async function addAlbum() {
    const name = newAlbum.trim()
    if (!name) return
    setBusy(true)
    const result = await createAlbumAction({
      vehicleId,
      name,
      occurredOn: null,
      notes: null,
    })
    setBusy(false)
    if (!result.ok) {
      toast.show(result.error)
      return
    }
    setNewAlbum('')
    toast.show('Album added')
  }

  return (
    <div className="space-y-5">
      <GalleryUpload
        userId={userId}
        vehicleId={vehicleId}
        albumId={albumFilter !== 'all' && albumFilter !== 'loose' ? albumFilter : null}
        today={today}
        usage={usage}
      />

      {albums.length > 0 || photos.length > 0 ? (
        <div className="flex flex-wrap gap-2">
          <FilterChip active={albumFilter === 'all'} onClick={() => setAlbumFilter('all')}>
            All · {photos.length}
          </FilterChip>
          {albums.map((album) => (
            <FilterChip
              key={album.id}
              active={albumFilter === album.id}
              onClick={() => setAlbumFilter(album.id)}
            >
              {album.name} · {album.photo_count}
            </FilterChip>
          ))}
          <FilterChip active={albumFilter === 'loose'} onClick={() => setAlbumFilter('loose')}>
            Unfiled
          </FilterChip>
        </div>
      ) : null}

      <div className="flex flex-wrap items-center gap-2">
        <input
          value={newAlbum}
          onChange={(event) => setNewAlbum(event.target.value)}
          placeholder="New album"
          aria-label="New album name"
          className={`${INPUT_CLASS} max-w-[14rem] flex-1`}
        />
        <Button onClick={() => void addAlbum()} disabled={busy || newAlbum.trim().length === 0}>
          Add album
        </Button>
        {albumFilter !== 'all' && albumFilter !== 'loose' ? (
          <Button
            variant="danger"
            disabled={busy}
            onClick={async () => {
              const result = await deleteAlbumAction(vehicleId, albumFilter)
              if (!result.ok) return toast.show(result.error)
              setAlbumFilter('all')
              toast.show('Album removed. Its photos are still here.')
            }}
          >
            Delete album
          </Button>
        ) : null}
      </div>

      {photos.length === 0 ? (
        <div className="flex flex-col items-start gap-3 rounded-md border border-border bg-surface p-6">
          <Camera {...ICON_EMPTY} className="text-ink-faint" aria-hidden />
          <p className="text-body text-ink-muted">
            No photos yet. Add the first one and it goes up at full size, exactly as it came off
            the camera.
          </p>
        </div>
      ) : (
        <>
          <div className="flex items-center justify-between gap-4">
            <p className="text-caption text-ink-muted">
              {visible.length} {visible.length === 1 ? 'photo' : 'photos'}
            </p>
            <Button
              size="sm"
              onClick={() => {
                setSelecting((on) => !on)
                setSelection(new Set())
              }}
            >
              {selecting ? 'Done' : 'Select'}
            </Button>
          </div>

          <ul className="grid grid-cols-3 gap-2">
            {visible.map((photo, position) => {
              const chosen = selection.has(photo.id)
              return (
                <li key={photo.id}>
                  <button
                    type="button"
                    onClick={() => (selecting ? toggle(photo.id) : setViewing(position))}
                    aria-pressed={selecting ? chosen : undefined}
                    className={[
                      'relative block aspect-square w-full overflow-hidden rounded-sm border',
                      chosen ? 'border-accent' : 'border-border',
                    ].join(' ')}
                  >
                    {photo.thumb_url ? (
                      /* A signed URL that expires in an hour. next/image would
                         cache an optimised copy against a URL that stops
                         resolving, and serve a stale 404 from then on. */
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={photo.thumb_url}
                        alt={photo.caption ?? `Photo of ${vehicleName}`}
                        loading="lazy"
                        className="size-full object-cover"
                      />
                    ) : (
                      <span className="flex size-full flex-col items-center justify-center gap-1 bg-surface-sunken px-1 text-center">
                        <Camera {...ICON_UI} className="text-ink-faint" aria-hidden />
                        <span className="text-caption text-ink-faint">No preview</span>
                      </span>
                    )}
                    {chosen ? (
                      <span
                        aria-hidden
                        className="absolute inset-0 border-2 border-accent bg-accent/20"
                      />
                    ) : null}
                  </button>
                </li>
              )
            })}
          </ul>
        </>
      )}

      {selecting && selection.size > 0 ? (
        <div className="sticky bottom-nav z-10 flex flex-wrap items-center gap-2 rounded-md border border-border bg-surface p-3">
          <p className="flex-1 text-caption text-ink-muted">
            {selection.size} selected · {formatBytes(selectedBytes)}
          </p>
          <Button disabled={busy} onClick={() => void download(selectedPhotos)}>
            Download
          </Button>
          <Button variant="danger" disabled={busy} onClick={() => void removeSelected()}>
            Remove
          </Button>
        </div>
      ) : null}

      {/* The viewer built in Phase 4, not a second one. It is a native
          <dialog> opened with showModal(), so it lives in the browser's top
          layer — above the nav bar, the FAB and every stacking context on the
          page, with a real ::backdrop behind it. The hand-rolled overlay this
          replaces used `bg-ink/95`, and Tailwind cannot apply an opacity
          modifier to a colour that is a bare CSS variable: the class was never
          emitted, so the overlay had no background at all and the whole gallery
          showed through it. */}
      <PhotoViewer
        photos={viewerPhotos}
        index={viewing}
        context={vehicleName}
        onClose={() => setViewing(-1)}
        action={
          viewing >= 0 && visible[viewing] ? (
            <button
              type="button"
              onClick={() => void download([visible[viewing] as GalleryPhotoView])}
              className="viewer-chrome min-h-touch rounded-md px-4 text-label"
            >
              Download
            </button>
          ) : null
        }
        meta={(photo) => {
          const source = visible.find((row) => row.id === photo.id)
          if (!source) return null
          return (
            <p className="font-mono text-caption">
              {source.original_filename} · {formatBytes(source.bytes)}
              {source.width && source.height ? ` · ${source.width}x${source.height}` : ''}
              {` · ${dateLabel(source.occurred_on)}`}
              {source.album_name ? ` · ${source.album_name}` : ''}
              {source.odometer_km !== null ? ` · ${source.odometer_km} km` : ''}
            </p>
          )
        }}
      />
    </div>
  )
}

function FilterChip({
  active,
  onClick,
  children,
}: {
  active: boolean
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={[
        'min-h-touch rounded-full border px-3 text-label',
        active ? 'border-accent bg-accent text-accent-ink' : 'border-border-strong text-ink-muted',
      ].join(' ')}
    >
      {children}
    </button>
  )
}
