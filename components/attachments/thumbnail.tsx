import Image from 'next/image'

import { photoAlt } from '@/lib/attachments/types'
import { tiltFor, tornEdgeFor } from '@/lib/timeline/tilt'

type ThumbnailProps = {
  url: string | null
  /** The hash source for the tilt and the torn edge. The attachment's id. */
  id: string
  caption: string | null
  /** Used to build alt text when there is no caption. */
  context: string
  size?: number
  /** The first image on a screen is above the fold; everything else is not. */
  eager?: boolean
  className?: string
}

/**
 * A photo in a feed: square, masked to one irregular edge, tilted a degree or
 * two from a hash of its id (docs/03-DESIGN.md, signature element 4).
 *
 * The frame is a fixed square whether or not the image has arrived, so nothing
 * on the page moves when it does — the single largest source of layout shift in
 * an app like this is a photograph that turns up late and pushes a paragraph
 * down. Everything below the fold is lazy; the caller says which one is not.
 */
export function Thumbnail({
  url,
  id,
  caption,
  context,
  size = 72,
  eager = false,
  className = '',
}: ThumbnailProps) {
  const tilt = tiltFor(id)
  const edge = tornEdgeFor(id)

  return (
    <span
      className={`torn torn-${edge} relative block shrink-0 overflow-hidden bg-surface-sunken ${className}`}
      style={{ width: size, height: size, ['--tilt' as string]: `${tilt}deg` }}
    >
      {url === null ? null : url.startsWith('blob:') ? (
        /* A blob URL points at memory in this tab. There is nothing for the
           image optimiser to fetch and next/image cannot serve one, so a photo
           that has just been picked is a plain img until the page reloads. */
        // eslint-disable-next-line @next/next/no-img-element
        <img src={url} alt={photoAlt(caption, context)} className="size-full object-cover" />
      ) : (
        <Image
          src={url}
          alt={photoAlt(caption, context)}
          fill
          sizes={`${size}px`}
          loading={eager ? 'eager' : 'lazy'}
          priority={false}
          className="object-cover"
        />
      )}
    </span>
  )
}
