import { describe, expect, it } from 'vitest'

import { cycleError, describeCycle, findCycle, withDependencies } from '@/lib/mods/graph'

const edges = (entries: Record<string, string[]>) =>
  new Map<string, string[]>(Object.entries(entries))

const titles = new Map<string, string>([
  ['a', 'Coilovers'],
  ['b', 'Wheels'],
  ['c', 'Tyres'],
  ['d', 'Camber arms'],
])

describe('findCycle', () => {
  it('finds nothing in an empty graph', () => {
    expect(findCycle('a', edges({}))).toBeNull()
  })

  it('finds nothing in a chain', () => {
    expect(findCycle('a', edges({ a: ['b'], b: ['c'] }))).toBeNull()
  })

  it('finds nothing in a diamond', () => {
    // Two paths to the same dependency is not a loop, and refusing it would be
    // refusing the most ordinary shape a plan takes.
    expect(findCycle('a', edges({ a: ['b', 'c'], b: ['d'], c: ['d'] }))).toBeNull()
  })

  it('finds a two-node loop', () => {
    expect(findCycle('a', edges({ a: ['b'], b: ['a'] }))).toEqual(['a', 'b', 'a'])
  })

  it('finds a three-node loop', () => {
    expect(findCycle('a', edges({ a: ['b'], b: ['c'], c: ['a'] }))).toEqual(['a', 'b', 'c', 'a'])
  })

  it('finds a self-loop', () => {
    expect(findCycle('a', edges({ a: ['a'] }))).toEqual(['a', 'a'])
  })

  it('walks past a dead branch to find the loop on the second one', () => {
    expect(findCycle('a', edges({ a: ['d', 'b'], b: ['c'], c: ['a'] }))).toEqual([
      'a',
      'b',
      'c',
      'a',
    ])
  })

  it('reports a loop that does not pass through the starting node', () => {
    const found = findCycle('a', edges({ a: ['b'], b: ['c'], c: ['b'] }))
    expect(found).toEqual(['b', 'c', 'b'])
  })

  it('terminates on a graph that is already cyclic and unrelated', () => {
    expect(findCycle('d', edges({ a: ['b'], b: ['a'], d: [] }))).toBeNull()
  })
})

describe('withDependencies', () => {
  it('replaces the edges of one node and leaves the rest alone', () => {
    const before = edges({ a: ['b'], b: ['c'] })
    const after = withDependencies(before, 'a', ['c'])
    expect(after.get('a')).toEqual(['c'])
    expect(after.get('b')).toEqual(['c'])
    expect(before.get('a')).toEqual(['b'])
  })
})

describe('describeCycle', () => {
  it('reads a two-node loop as two clauses', () => {
    expect(describeCycle(['a', 'b', 'a'], titles)).toBe(
      'Coilovers needs Wheels, and Wheels needs Coilovers.',
    )
  })

  it('reads a three-node loop as three clauses', () => {
    expect(describeCycle(['a', 'b', 'c', 'a'], titles)).toBe(
      'Coilovers needs Wheels, Wheels needs Tyres, and Tyres needs Coilovers.',
    )
  })

  it('reads a self-loop as one clause', () => {
    expect(describeCycle(['a', 'a'], titles)).toBe('Coilovers needs Coilovers.')
  })

  it('does not invent a name for a mod it cannot see', () => {
    expect(describeCycle(['a', 'z', 'a'], titles)).toContain('a mod that is not on this board')
  })
})

describe('cycleError', () => {
  it('passes a dependency that closes no loop', () => {
    expect(cycleError('a', ['b'], edges({ b: ['c'] }), titles)).toBeNull()
  })

  it('names the loop it would close', () => {
    expect(cycleError('a', ['b'], edges({ b: ['a'] }), titles)).toBe(
      'That would make a loop: Coilovers needs Wheels, and Wheels needs Coilovers.',
    )
  })

  it('checks the graph as it would be, not as it is', () => {
    // Nothing stored is cyclic; the proposed edge is what closes it.
    const stored = edges({ b: ['c'], c: ['a'] })
    expect(cycleError('a', ['b'], stored, titles)).toBe(
      'That would make a loop: Coilovers needs Wheels, Wheels needs Tyres, and Tyres needs Coilovers.',
    )
  })

  it('passes when the dependencies are cleared', () => {
    expect(cycleError('a', [], edges({ a: ['b'], b: ['a'] }), titles)).toBeNull()
  })
})
