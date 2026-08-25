import { describe, expect, it } from 'vitest'

import { hashString, tiltFor, tornEdgeFor } from '@/lib/timeline/tilt'

/**
 * The tilt has to be a property of the row rather than of the moment it was
 * drawn: it is computed on the server and again in the browser, and a photo that
 * leans one way in the HTML and the other way after hydration is a visible bug
 * (docs/03-DESIGN.md, signature element 4).
 */
describe('hashString', () => {
  it('is stable', () => {
    expect(hashString('a5d0c1f2-0000-4000-8000-000000000001')).toBe(
      hashString('a5d0c1f2-0000-4000-8000-000000000001'),
    )
  })

  it('separates strings that differ by one character', () => {
    const a = hashString('a5d0c1f2-0000-4000-8000-000000000001')
    const b = hashString('a5d0c1f2-0000-4000-8000-000000000002')
    expect(a).not.toBe(b)
  })

  it('stays a 32-bit unsigned integer', () => {
    const long = 'x'.repeat(4000)
    const hash = hashString(long)
    expect(Number.isInteger(hash)).toBe(true)
    expect(hash).toBeGreaterThanOrEqual(0)
    expect(hash).toBeLessThanOrEqual(0xffffffff)
  })

  it('handles the empty string', () => {
    expect(hashString('')).toBe(0x811c9dc5)
  })
})

/** A hundred realistic uuids, so the assertions below are about a population. */
const IDS = Array.from(
  { length: 100 },
  (_, index) => `7f${String(index).padStart(6, '0')}-1111-4222-8333-44445555${String(index % 10)}${String(index % 7)}${String(index % 3)}${String(index % 5)}`,
)

describe('tiltFor', () => {
  it('is between one and two degrees, either way', () => {
    for (const id of IDS) {
      const tilt = tiltFor(id)
      expect(Math.abs(tilt)).toBeGreaterThanOrEqual(1)
      expect(Math.abs(tilt)).toBeLessThanOrEqual(2)
    }
  })

  it('is never flat', () => {
    // A photo that hashes to zero degrees reads as a mistake, not as variety.
    for (const id of IDS) expect(tiltFor(id)).not.toBe(0)
  })

  it('leans both ways across a feed', () => {
    const left = IDS.filter((id) => tiltFor(id) < 0).length
    expect(left).toBeGreaterThan(0)
    expect(left).toBeLessThan(IDS.length)
  })

  it('gives the same answer every time', () => {
    for (const id of IDS) expect(tiltFor(id)).toBe(tiltFor(id))
  })
})

describe('tornEdgeFor', () => {
  it('uses all four edges across a feed', () => {
    const edges = new Set(IDS.map((id) => tornEdgeFor(id)))
    expect(edges.size).toBe(4)
  })

  it('does not move in lockstep with the tilt', () => {
    // Seeded separately on purpose: one seed would give four visible
    // combinations of edge and tilt rather than twenty-four.
    const pairs = new Set(IDS.map((id) => `${tornEdgeFor(id)}:${tiltFor(id)}`))
    expect(pairs.size).toBeGreaterThan(6)
  })

  it('gives the same answer every time', () => {
    for (const id of IDS) expect(tornEdgeFor(id)).toBe(tornEdgeFor(id))
  })
})
