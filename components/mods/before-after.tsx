// One handle, dragged. There is no server-side version of that.
'use client'

import Image from 'next/image'
import { useRef, useState, type KeyboardEvent as ReactKeyboardEvent, type PointerEvent as ReactPointerEvent } from 'react'

import { Grip } from '@/components/icons/grip'
import { photoAlt, type AttachmentView } from '@/lib/attachments/types'

export type InspirationPhoto = AttachmentView & { mod_title: string }

type BeforeAfterProps = {
  /** The car as it is. Signed on the server. */
  heroUrl: string
  vehicleName: string
  photos: readonly InspirationPhoto[]
}

/** Arrow keys move the handle by this much; a page key by five times it. */
const STEP = 2

/**
 * Before and after.
 *
 * docs/01-PRODUCT.md calls this the motivation feature and then says exactly how
 * much of it to build: "Keep it simple: two images, one handle, no animation
 * beyond the drag." So there is no reveal, no easing, no auto-sweep on load —
 * the handle sits in the middle and moves when it is moved.
 *
 * The left of the handle is the car. The right is what you have pinned to a mod.
 * Which way round matters: the photograph of the thing you have not bought yet
 * is the one you have to drag towards yourself.
 *
 * The handle is a real slider — `role="slider"` with a value and arrow keys — so
 * it works without a pointer, and the whole frame reserves its aspect ratio so
 * nothing moves when the images arrive.
 */
export function BeforeAfter({ heroUrl, vehicleName, photos }: BeforeAfterProps) {
  const [chosen, setChosen] = useState(0)
  const [position, setPosition] = useState(50)
  const frame = useRef<HTMLDivElement>(null)

  const after = photos[chosen]
  if (!after?.url) return null

  function moveTo(clientX: number) {
    const rect = frame.current?.getBoundingClientRect()
    if (!rect || rect.width === 0) return
    const ratio = ((clientX - rect.left) / rect.width) * 100
    setPosition(Math.max(0, Math.min(100, ratio)))
  }

  function onPointerDown(event: ReactPointerEvent<HTMLElement>) {
    event.currentTarget.setPointerCapture(event.pointerId)
    moveTo(event.clientX)
  }

  function onPointerMove(event: ReactPointerEvent<HTMLElement>) {
    if (!event.currentTarget.hasPointerCapture(event.pointerId)) return
    moveTo(event.clientX)
  }

  function onKeyDown(event: ReactKeyboardEvent<HTMLElement>) {
    const delta =
      event.key === 'ArrowLeft'
        ? -STEP
        : event.key === 'ArrowRight'
          ? STEP
          : event.key === 'Home'
            ? -100
            : event.key === 'End'
              ? 100
              : 0
    if (delta === 0) return
    event.preventDefault()
    setPosition((previous) => Math.max(0, Math.min(100, previous + delta)))
  }

  return (
    <>
      <div
        ref={frame}
        className="relative aspect-video w-full overflow-hidden rounded-md border border-border bg-surface-sunken"
      >
        <Image
          src={heroUrl}
          alt={`${vehicleName} as it is now`}
          fill
          sizes="(min-width: 640px) 640px, 100vw"
          className="object-cover"
        />

        <div
          className="absolute inset-0"
          style={{ clipPath: `inset(0 0 0 ${position}%)` }}
        >
          <Image
            src={after.url}
            alt={photoAlt(after.caption, `${after.mod_title} on ${vehicleName}`)}
            fill
            sizes="(min-width: 640px) 640px, 100vw"
            className="object-cover"
          />
        </div>

        <span
          className="pointer-events-none absolute inset-y-0 w-px bg-accent"
          style={{ left: `${position}%` }}
          aria-hidden
        />

        <button
          type="button"
          role="slider"
          aria-label={`Compare ${vehicleName} with ${after.mod_title}`}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={Math.round(position)}
          aria-valuetext={`${Math.round(position)}% of the way across`}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onKeyDown={onKeyDown}
          className="absolute inset-y-0 flex w-touch cursor-ew-resize items-center justify-center"
          style={{ left: `${position}%`, marginLeft: 'calc(var(--touch-min) / -2)', touchAction: 'none' }}
        >
          <span className="flex size-8 items-center justify-center rounded-full border border-accent bg-surface text-accent">
            <Grip size={16} />
          </span>
        </button>

        <span className="absolute bottom-2 left-2 rounded-sm bg-surface px-2 text-caption text-ink-muted">
          Now
        </span>
        <span className="absolute bottom-2 right-2 max-w-[50%] truncate rounded-sm bg-surface px-2 text-caption text-ink-muted">
          {after.mod_title}
        </span>
      </div>

      {photos.length > 1 ? (
        <ul className="flex gap-2 overflow-x-auto pb-1">
          {photos.map((photo, index) => (
            <li key={photo.id}>
              <button
                type="button"
                onClick={() => setChosen(index)}
                aria-pressed={index === chosen}
                className={[
                  'relative block size-touch overflow-hidden rounded-sm border',
                  index === chosen ? 'border-accent' : 'border-border',
                ].join(' ')}
              >
                {photo.url ? (
                  <Image
                    src={photo.url}
                    alt={photoAlt(photo.caption, photo.mod_title)}
                    fill
                    sizes="44px"
                    className="object-cover"
                  />
                ) : null}
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </>
  )
}
