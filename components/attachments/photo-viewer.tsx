// Swiping, pinching and the dialog's open state are all browser-side.
'use client'

import Image from 'next/image'
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'

import { photoAlt, type AttachmentView } from '@/lib/attachments/types'

type PhotoViewerProps = {
  photos: readonly AttachmentView[]
  /** Which photo to open on. Below zero means closed. */
  index: number
  /** Names what is in the pictures, for alt text on the ones with no caption. */
  context: string
  /** An extra control beside Close. The gallery puts Download here. */
  action?: ReactNode
  /** A line under the caption: filename, size, dimensions. */
  meta?: (photo: AttachmentView) => ReactNode
  onClose: () => void
}

const MAX_SCALE = 4

/**
 * Whether a click landed on the picture or on the dark around it.
 *
 * `object-contain` letterboxes, but the `img` element still fills its frame, so
 * the event target is the image wherever you tap. The rendered picture's box
 * has to be worked out from its natural proportions instead — and that is worth
 * doing, because the bands above and below a 4:3 photo on a phone are most of
 * the screen, and tapping them to dismiss is what everyone expects a
 * full-screen photo to do.
 */
function tappedOutsidePicture(image: HTMLImageElement, clientX: number, clientY: number): boolean {
  const frame = image.getBoundingClientRect()
  const naturalRatio = image.naturalWidth / image.naturalHeight
  if (!Number.isFinite(naturalRatio) || naturalRatio <= 0) return false

  const frameRatio = frame.width / frame.height
  const width = frameRatio > naturalRatio ? frame.height * naturalRatio : frame.width
  const height = frameRatio > naturalRatio ? frame.height : frame.width / naturalRatio
  const left = frame.left + (frame.width - width) / 2
  const top = frame.top + (frame.height - height) / 2

  return clientX < left || clientX > left + width || clientY < top || clientY > top + height
}

function distance(touches: TouchList): number {
  const [a, b] = [touches[0], touches[1]]
  if (!a || !b) return 0
  return Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY)
}

/**
 * The full-screen photo viewer: swipe between photos, pinch to zoom, read the
 * caption, close.
 *
 * Swiping is the browser's own horizontal scrolling with mandatory snap points,
 * not a gesture library — it gets momentum, rubber-banding, an honest scrollbar
 * position and a keyboard for free, and it costs no JavaScript. The only gesture
 * written by hand is the pinch, because nothing in CSS reports one.
 *
 * While a photo is zoomed the track stops scrolling, so a pan across a magnified
 * engine bay does not fly off to the next picture. Letting go back at 1x hands
 * the swipe back.
 */
export function PhotoViewer({
  photos,
  index,
  context,
  action,
  meta,
  onClose,
}: PhotoViewerProps) {
  const dialog = useRef<HTMLDialogElement>(null)
  const track = useRef<HTMLDivElement>(null)
  const [active, setActive] = useState(Math.max(0, index))
  const [zoom, setZoom] = useState({ scale: 1, x: 0, y: 0 })

  const open = index >= 0 && photos.length > 0
  const zoomed = zoom.scale > 1.01

  /** Pinch and pan bookkeeping. Refs, because a gesture is not render state. */
  const gesture = useRef({ startDistance: 0, startScale: 1, panX: 0, panY: 0, originX: 0, originY: 0 })

  useEffect(() => {
    const element = dialog.current
    if (!element) return
    if (open && !element.open) element.showModal()
    if (!open && element.open) element.close()
  }, [open])

  // A modal dialog makes the document inert, but not every engine stops it
  // scrolling underneath — and a page that slides around behind a photo is the
  // tell that the photo is not really full screen.
  useEffect(() => {
    if (!open) return
    const root = document.documentElement
    const previous = root.style.overflow
    root.style.overflow = 'hidden'
    return () => {
      root.style.overflow = previous
    }
  }, [open])

  // Opening on photo three means starting scrolled to photo three. `instant`
  // rather than smooth: the viewer should already be there when it fades in.
  //
  // Only the scroll position is set here, never React state: the viewer is
  // mounted by the tap that opens it and unmounted when it closes, so `index`
  // cannot change underneath it and `active` starts where it belongs.
  useEffect(() => {
    if (!open) return
    const element = track.current
    if (!element) return
    element.scrollTo({ left: element.clientWidth * index, behavior: 'instant' })
  }, [open, index])

  const onScroll = useCallback(() => {
    const element = track.current
    if (!element || element.clientWidth === 0) return
    const next = Math.round(element.scrollLeft / element.clientWidth)
    setActive((previous) => (previous === next ? previous : next))
  }, [])

  const step = useCallback((delta: number) => {
    const element = track.current
    if (!element) return
    setZoom({ scale: 1, x: 0, y: 0 })
    element.scrollBy({ left: element.clientWidth * delta, behavior: 'smooth' })
  }, [])

  function onTouchStart(event: React.TouchEvent) {
    if (event.touches.length === 2) {
      gesture.current.startDistance = distance(event.touches as unknown as TouchList)
      gesture.current.startScale = zoom.scale
      return
    }
    if (event.touches.length === 1 && zoomed) {
      const touch = event.touches[0]
      if (!touch) return
      gesture.current.originX = touch.clientX
      gesture.current.originY = touch.clientY
      gesture.current.panX = zoom.x
      gesture.current.panY = zoom.y
    }
  }

  function onTouchMove(event: React.TouchEvent) {
    if (event.touches.length === 2 && gesture.current.startDistance > 0) {
      const ratio = distance(event.touches as unknown as TouchList) / gesture.current.startDistance
      const scale = Math.min(MAX_SCALE, Math.max(1, gesture.current.startScale * ratio))
      setZoom((previous) => ({
        scale,
        x: scale === 1 ? 0 : previous.x,
        y: scale === 1 ? 0 : previous.y,
      }))
      return
    }
    if (event.touches.length === 1 && zoomed) {
      const touch = event.touches[0]
      if (!touch) return
      setZoom((previous) => ({
        ...previous,
        x: gesture.current.panX + (touch.clientX - gesture.current.originX),
        y: gesture.current.panY + (touch.clientY - gesture.current.originY),
      }))
    }
  }

  function onTouchEnd(event: React.TouchEvent) {
    if (event.touches.length === 0) gesture.current.startDistance = 0
    if (zoom.scale <= 1.01) setZoom({ scale: 1, x: 0, y: 0 })
  }

  /** Double tap is the other half of pinch: nobody pinches on a laptop. */
  function toggleZoom() {
    setZoom((previous) =>
      previous.scale > 1.01 ? { scale: 1, x: 0, y: 0 } : { scale: 2.5, x: 0, y: 0 },
    )
  }

  const current = photos[active]

  return (
    <dialog
      ref={dialog}
      className="viewer"
      aria-label="Photo"
      onClose={onClose}
      onCancel={(event) => {
        event.preventDefault()
        onClose()
      }}
      onKeyDown={(event) => {
        if (event.key === 'ArrowRight') step(1)
        if (event.key === 'ArrowLeft') step(-1)
      }}
      onClick={(event) => {
        // A click landing on the dialog element itself is a click on the
        // backdrop: the photo and its chrome sit in the div below and stop
        // there. Same rule the bottom sheet uses.
        if (event.target === dialog.current) onClose()
      }}
    >
      {open ? (
        <div className="relative size-full">
          <div
            ref={track}
            className="viewer-track"
            style={{ overflowX: zoomed ? 'hidden' : 'auto' }}
            onScroll={onScroll}
          >
            {photos.map((photo, position) => (
              <div
                key={photo.id}
                className="viewer-frame"
                onTouchStart={onTouchStart}
                onTouchMove={onTouchMove}
                onTouchEnd={onTouchEnd}
                onDoubleClick={toggleZoom}
                onClick={(event) => {
                  if (zoomed) return
                  const image = event.currentTarget.querySelector('img')
                  if (image && tappedOutsidePicture(image, event.clientX, event.clientY)) {
                    onClose()
                  }
                }}
              >
                {photo.url ? (
                  <div
                    className="relative size-full"
                    style={{
                      transform:
                        position === active
                          ? `translate(${zoom.x}px, ${zoom.y}px) scale(${zoom.scale})`
                          : undefined,
                      touchAction: zoomed ? 'none' : 'pan-x pinch-zoom',
                    }}
                  >
                    <Image
                      src={photo.url}
                      alt={photoAlt(photo.caption, context)}
                      fill
                      sizes="100vw"
                      /* The one the viewer opened on is wanted now; its
                         neighbours are wanted the moment a thumb moves. */
                      priority={position === Math.max(0, index)}
                      /* Served exactly as stored. The upload is already a WebP
                         sized for a full screen, so putting it through the
                         optimiser here only spends a second lossy pass to
                         arrive at the same pixels. See lib/images/budgets.ts. */
                      unoptimized
                      className="object-contain"
                      draggable={false}
                    />
                  </div>
                ) : (
                  <p className="viewer-text px-6 text-center text-body">
                    That photo could not be loaded.
                  </p>
                )}
              </div>
            ))}
          </div>

          <div
            className="pointer-events-none absolute inset-x-0 top-0 flex items-start justify-between gap-4 p-4"
            style={{ paddingTop: 'calc(var(--space-4) + env(safe-area-inset-top))' }}
          >
            <span className="viewer-chrome rounded-full px-3 py-1 font-mono text-caption">
              {active + 1} / {photos.length}
            </span>
            <div className="pointer-events-auto flex items-center gap-2">
              {action}
              <button
                type="button"
                onClick={onClose}
                className="viewer-chrome min-h-touch rounded-md px-4 text-label"
              >
                Close
              </button>
            </div>
          </div>

          {current && (current.caption || meta) ? (
            <div
              className="viewer-chrome absolute inset-x-0 bottom-0 space-y-1 px-4 py-3"
              style={{ paddingBottom: 'calc(var(--space-3) + env(safe-area-inset-bottom))' }}
            >
              {current.caption ? <p className="text-body">{current.caption}</p> : null}
              {meta ? meta(current) : null}
            </div>
          ) : null}
        </div>
      ) : null}
    </dialog>
  )
}
