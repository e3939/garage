import type { CSSProperties, ReactNode } from 'react'

import { stampRotationFor } from '@/lib/timeline/tilt'

type StampProps = {
  /**
   * The row this stamp belongs to. Its lean is derived from this rather than
   * chosen, so the same entry leans the same way after a reload and the feed
   * still varies down the page (docs/03-DESIGN.md, signature element 3).
   */
  id: string
  /** `lg` is a milestone, which is the whole headline. `sm` marks a row. */
  size?: 'sm' | 'lg'
  children: ReactNode
}

/**
 * A dealer stamp: brick outline on cream, eyebrow caps inside, leaning a few
 * degrees, with the ink density uneven across it.
 *
 * The colours and the noise are in `globals.css` under `.stamp`, because the
 * texture is a pseudo-element and the lean has to survive the reduced-motion
 * rule. Everything that varies per row is here.
 */
export function Stamp({ id, size = 'sm', children }: StampProps) {
  return (
    <span
      className={[
        'stamp inline-block font-display uppercase text-eyebrow',
        size === 'lg' ? 'px-3 py-2' : 'px-2 py-1',
      ].join(' ')}
      style={{ '--stamp-rotation': `${stampRotationFor(id)}deg` } as CSSProperties}
    >
      {children}
    </span>
  )
}
