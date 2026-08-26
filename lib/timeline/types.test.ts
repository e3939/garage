import { describe, expect, it } from 'vitest'

import { buildTimelineItems, cursorOf, type TimelineRow } from '@/lib/timeline/types'

function row(partial: Partial<TimelineRow> & { ref_id: string; occurred_on: string }): TimelineRow {
  return {
    kind: 'expense',
    created_at: '2026-08-20T10:00:00Z',
    day_heading: 'Thu 20 Aug',
    date_label: '20 Aug 2026',
    title: 'Something',
    subtitle: null,
    amount: null,
    currency: null,
    vehicle_id: 'vehicle-1',
    stamp: null,
    items: [],
    photos: [],
    ...partial,
  }
}

describe('buildTimelineItems', () => {
  it('puts one heading in front of each day', () => {
    const items = buildTimelineItems([
      row({ ref_id: 'a', occurred_on: '2026-08-20' }),
      row({ ref_id: 'b', occurred_on: '2026-08-20' }),
      row({ ref_id: 'c', occurred_on: '2026-08-18' }),
    ])

    expect(items.map((item) => item.kind)).toEqual(['day', 'row', 'row', 'day', 'row'])
    expect(items.filter((item) => item.kind === 'day').map((item) => item.key)).toEqual([
      'day-2026-08-20',
      'day-2026-08-18',
    ])
  })

  it('keys rows by their ref id, so a fuel month and an expense cannot collide', () => {
    const items = buildTimelineItems([
      row({ ref_id: 'expense-1', occurred_on: '2026-08-20' }),
      row({ ref_id: 'fuel-month-1', occurred_on: '2026-08-20', kind: 'fuel' }),
    ])
    const keys = items.map((item) => item.key)
    expect(new Set(keys).size).toBe(keys.length)
  })

  it('takes the heading from the first row of the day, which the server wrote', () => {
    const items = buildTimelineItems([
      row({ ref_id: 'a', occurred_on: '2026-08-20', day_heading: 'Yesterday' }),
      row({ ref_id: 'b', occurred_on: '2026-08-20', day_heading: 'Yesterday' }),
    ])
    const day = items[0]
    expect(day?.kind).toBe('day')
    expect(day && day.kind === 'day' ? day.heading : null).toBe('Yesterday')
  })

  it('is empty for an empty feed', () => {
    expect(buildTimelineItems([])).toEqual([])
  })

  it('opens a fresh day when the same date returns later in the feed', () => {
    // The feed is ordered by the server; if it were not, a repeated date would
    // silently merge into the wrong heading. Grouping consecutive runs rather
    // than collecting by date is what makes that impossible.
    const items = buildTimelineItems([
      row({ ref_id: 'a', occurred_on: '2026-08-20' }),
      row({ ref_id: 'b', occurred_on: '2026-08-18' }),
      row({ ref_id: 'c', occurred_on: '2026-08-20' }),
    ])
    expect(items.filter((item) => item.kind === 'day')).toHaveLength(3)
  })
})

describe('cursorOf', () => {
  it('carries the three columns the keyset orders by', () => {
    expect(
      cursorOf(row({ ref_id: 'a', occurred_on: '2026-08-20', created_at: '2026-08-20T01:02:03Z' })),
    ).toEqual({
      occurred_on: '2026-08-20',
      created_at: '2026-08-20T01:02:03Z',
      ref_id: 'a',
    })
  })
})
