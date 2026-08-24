// Windowing needs scroll position, so this is client-side by definition.
'use client'

import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'

type VirtualListProps<T> = {
  items: readonly T[]
  /**
   * Exact rendered height of an item, in pixels. Rows here are fixed-height.
   * Hoist it out of the component: it is a dependency of the offset table, so a
   * fresh closure every render would rebuild the table every render.
   */
  itemHeight: (item: T, index: number) => number
  renderItem: (item: T, index: number) => ReactNode
  keyOf: (item: T, index: number) => string
  /** Below this many items the list renders whole. CLAUDE.md section 3: 40. */
  threshold?: number
  overscan?: number
  className?: string
}

/** Index of the last offset boundary at or before `y`. */
function indexAt(offsets: number[], y: number): number {
  let low = 0
  let high = offsets.length - 1
  while (low < high) {
    const mid = (low + high + 1) >> 1
    if ((offsets[mid] ?? 0) <= y) low = mid
    else high = mid - 1
  }
  return low
}

/**
 * Window-scroll virtualisation over a flat list of known-height rows.
 *
 * The page scrolls, not an inner box — a nested scroller on a phone fights the
 * browser's own overscroll and the address-bar collapse. Off-screen rows are
 * replaced by two spacer divs, so the scrollbar never lies and nothing shifts.
 *
 * Heights must be exact rather than estimated, which is why the ledger's rows
 * and day headings are fixed-height and its text truncates rather than wraps.
 */
export function VirtualList<T>({
  items,
  itemHeight,
  renderItem,
  keyOf,
  threshold = 40,
  overscan = 6,
  className = '',
}: VirtualListProps<T>) {
  const container = useRef<HTMLDivElement>(null)

  // Prefix sums: offsets[i] is where item i starts, offsets[n] is the total.
  const offsets = useMemo(() => {
    const result = new Array<number>(items.length + 1)
    result[0] = 0
    for (let index = 0; index < items.length; index += 1) {
      result[index + 1] = (result[index] ?? 0) + itemHeight(items[index] as T, index)
    }
    return result
  }, [items, itemHeight])

  const virtualise = items.length > threshold

  // A window's worth to begin with, then the effect measures on mount. The
  // non-virtualised path ignores this entirely.
  const [range, setRange] = useState(() => ({ start: 0, end: threshold }))

  useEffect(() => {
    if (!virtualise) return

    let frame = 0
    const measure = () => {
      frame = 0
      const element = container.current
      if (!element) return
      const top = element.getBoundingClientRect().top + window.scrollY
      const viewTop = window.scrollY - top
      const viewBottom = viewTop + window.innerHeight
      const start = Math.max(0, indexAt(offsets, viewTop) - overscan)
      const end = Math.min(items.length, indexAt(offsets, viewBottom) + 1 + overscan)
      setRange((previous) =>
        previous.start === start && previous.end === end ? previous : { start, end },
      )
    }
    const onScroll = () => {
      if (!frame) frame = requestAnimationFrame(measure)
    }

    measure()
    window.addEventListener('scroll', onScroll, { passive: true })
    window.addEventListener('resize', onScroll)
    return () => {
      if (frame) cancelAnimationFrame(frame)
      window.removeEventListener('scroll', onScroll)
      window.removeEventListener('resize', onScroll)
    }
  }, [virtualise, offsets, items.length, overscan])

  const start = virtualise ? range.start : 0
  const end = virtualise ? Math.min(range.end, items.length) : items.length
  const total = offsets[items.length] ?? 0

  return (
    <div ref={container} className={className}>
      {start > 0 ? <div style={{ height: offsets[start] ?? 0 }} aria-hidden /> : null}
      {items.slice(start, end).map((item, offset) => {
        const index = start + offset
        return <div key={keyOf(item, index)}>{renderItem(item, index)}</div>
      })}
      {end < items.length ? <div style={{ height: total - (offsets[end] ?? 0) }} aria-hidden /> : null}
    </div>
  )
}
