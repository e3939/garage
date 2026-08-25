/**
 * The tilt on a photo in the feed.
 *
 * docs/03-DESIGN.md, signature element 4: a photo is "tilted by 1-2 degrees from
 * the id hash". Derived rather than random, because a tilt that changes on every
 * render is a page that never sits still — and because the same photo should
 * look the same after a reload, a navigation and a server render. The hash makes
 * it a property of the row rather than of the moment it was drawn.
 *
 * Pure, so it runs identically on the server and in the browser and there is no
 * hydration mismatch to reason about.
 */

/** FNV-1a, 32-bit. Small, fast, and spreads short uuid-shaped strings well. */
export function hashString(value: string): number {
  let hash = 0x811c9dc5
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index)
    hash = Math.imul(hash, 0x01000193) >>> 0
  }
  return hash >>> 0
}

/**
 * Six tilts, three each way, none of them zero: a photo that happens to hash to
 * flat reads as a mistake rather than as variety. Half a degree apart, which is
 * the difference between "these were laid down by hand" and "this layout is
 * broken".
 */
const TILTS = [-2, -1.5, -1, 1, 1.5, 2] as const

export function tiltFor(id: string): number {
  return TILTS[hashString(id) % TILTS.length] as number
}

/**
 * Which of the four torn edges to draw. The mask gives one irregular edge, and
 * varying which one keeps a column of thumbnails from looking like a repeat.
 */
const EDGES = ['b', 'r', 't', 'l'] as const

export type TornEdge = (typeof EDGES)[number]

export function tornEdgeFor(id: string): TornEdge {
  // A second, differently-seeded pass, so edge and tilt do not move together
  // and produce only four visible combinations instead of twenty-four.
  return EDGES[hashString(`${id}:edge`) % EDGES.length] as TornEdge
}
