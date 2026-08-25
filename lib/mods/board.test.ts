import { describe, expect, it } from 'vitest'

import { applyMove, columnsOf, insertionIndex, nudge } from '@/lib/mods/board'
import type { ModCard, ModStatus } from '@/lib/mods/types'

const TODAY = '2026-08-26'

function card(
  id: string,
  status: ModStatus,
  board_order: number,
  created_at = `2026-01-01T00:00:0${board_order}Z`,
): ModCard {
  return {
    id,
    vehicle_id: 'v1',
    title: id.toUpperCase(),
    description: null,
    status,
    priority: 'someday',
    est_cost_min: null,
    est_cost_max: null,
    estimate: null,
    actual: 0,
    variance: null,
    expense_count: 0,
    currency: 'VND',
    target_date: null,
    links: [],
    notes: null,
    installed_on: null,
    board_order,
    created_at,
    depends_on: [],
    photos: [],
  }
}

/** A readable snapshot: the ids in each column, in order. */
function shape(cards: readonly ModCard[]) {
  const columns = columnsOf(cards)
  return Object.fromEntries(
    Object.entries(columns).map(([status, list]) => [status, list.map((entry) => entry.id)]),
  )
}

describe('columnsOf', () => {
  it('groups by status and orders by board_order', () => {
    const cards = [
      card('b', 'dreaming', 1),
      card('a', 'dreaming', 0),
      card('c', 'ordered', 0),
    ]
    expect(shape(cards)).toMatchObject({ dreaming: ['a', 'b'], ordered: ['c'], saving: [] })
  })

  it('breaks a tie on creation time, not on the order rows arrived in', () => {
    const cards = [
      card('later', 'dreaming', 0, '2026-02-01T00:00:00Z'),
      card('earlier', 'dreaming', 0, '2026-01-01T00:00:00Z'),
    ]
    expect(shape(cards).dreaming).toEqual(['earlier', 'later'])
  })

  it('leaves out a status that is not a column', () => {
    expect(shape([card('a', 'abandoned', 0)])).toMatchObject({ dreaming: [], installed: [] })
  })
})

describe('insertionIndex', () => {
  it('drops above everything when the pointer is above the first midpoint', () => {
    expect(insertionIndex([50, 150, 250], 10)).toBe(0)
  })

  it('drops between two cards', () => {
    expect(insertionIndex([50, 150, 250], 100)).toBe(1)
    expect(insertionIndex([50, 150, 250], 200)).toBe(2)
  })

  it('drops at the end when the pointer is past everything', () => {
    expect(insertionIndex([50, 150, 250], 900)).toBe(3)
  })

  it('drops at the top of an empty column', () => {
    expect(insertionIndex([], 400)).toBe(0)
  })
})

describe('applyMove', () => {
  const cards = [
    card('a', 'dreaming', 0),
    card('b', 'dreaming', 1),
    card('c', 'dreaming', 2),
    card('x', 'ordered', 0),
  ]

  it('reorders within a column and writes only what moved', () => {
    const result = applyMove(cards, { id: 'c', to: 'dreaming', index: 0, today: TODAY })
    expect(shape(result.cards).dreaming).toEqual(['c', 'a', 'b'])
    expect(result.moves).toEqual([
      { id: 'a', status: 'dreaming', board_order: 1 },
      { id: 'b', status: 'dreaming', board_order: 2 },
      { id: 'c', status: 'dreaming', board_order: 0 },
    ])
  })

  it('writes nothing when a card is dropped back where it was', () => {
    expect(applyMove(cards, { id: 'b', to: 'dreaming', index: 1, today: TODAY }).moves).toEqual([])
  })

  it('moves between columns and renumbers both', () => {
    const result = applyMove(cards, { id: 'a', to: 'ordered', index: 1, today: TODAY })
    expect(shape(result.cards)).toMatchObject({
      dreaming: ['b', 'c'],
      ordered: ['x', 'a'],
    })
    expect(result.moves).toContainEqual({ id: 'a', status: 'ordered', board_order: 1 })
    expect(result.moves).toContainEqual({ id: 'b', status: 'dreaming', board_order: 0 })
  })

  it('clamps an index past the end of the target column', () => {
    const result = applyMove(cards, { id: 'a', to: 'ordered', index: 99, today: TODAY })
    expect(shape(result.cards).ordered).toEqual(['x', 'a'])
  })

  it('stamps installed_on when a card lands in Installed', () => {
    const result = applyMove(cards, { id: 'a', to: 'installed', index: 0, today: TODAY })
    expect(result.cards.find((entry) => entry.id === 'a')?.installed_on).toBe(TODAY)
  })

  it('keeps an installed_on that was already there', () => {
    const stamped = cards.map((entry) =>
      entry.id === 'a' ? { ...entry, status: 'installed' as ModStatus, installed_on: '2025-05-05' } : entry,
    )
    const result = applyMove(stamped, { id: 'a', to: 'installed', index: 0, today: TODAY })
    expect(result.cards.find((entry) => entry.id === 'a')?.installed_on).toBe('2025-05-05')
  })

  it('clears installed_on when a card leaves Installed', () => {
    const stamped = cards.map((entry) =>
      entry.id === 'a' ? { ...entry, status: 'installed' as ModStatus, installed_on: TODAY } : entry,
    )
    const result = applyMove(stamped, { id: 'a', to: 'saving', index: 0, today: TODAY })
    expect(result.cards.find((entry) => entry.id === 'a')?.installed_on).toBeNull()
  })

  it('does nothing for a card that is not on the board', () => {
    expect(applyMove(cards, { id: 'nope', to: 'saving', index: 0, today: TODAY }).moves).toEqual([])
  })
})

describe('nudge', () => {
  const cards = [
    card('a', 'dreaming', 0),
    card('b', 'dreaming', 1),
    card('x', 'researching', 0),
    card('y', 'researching', 1),
    card('z', 'researching', 2),
  ]

  it('moves a card down its column', () => {
    expect(shape(nudge(cards, 'a', 'down', TODAY)!.cards).dreaming).toEqual(['b', 'a'])
  })

  it('refuses to move the top card up', () => {
    expect(nudge(cards, 'a', 'up', TODAY)).toBeNull()
  })

  it('refuses to move the bottom card down', () => {
    expect(nudge(cards, 'b', 'down', TODAY)).toBeNull()
  })

  it('moves into the next column at the same height', () => {
    const result = nudge(cards, 'b', 'right', TODAY)
    expect(shape(result!.cards).researching).toEqual(['x', 'b', 'y', 'z'])
  })

  it('lands at the end when the next column is shorter', () => {
    const result = nudge(cards, 'z', 'left', TODAY)
    expect(shape(result!.cards).dreaming).toEqual(['a', 'b', 'z'])
  })

  it('refuses to move off the left edge of the board', () => {
    expect(nudge(cards, 'a', 'left', TODAY)).toBeNull()
  })

  it('refuses to move off the right edge of the board', () => {
    expect(nudge([card('a', 'installed', 0)], 'a', 'right', TODAY)).toBeNull()
  })
})
