import { describe, expect, it } from 'vitest'

import {
  addDays,
  addMonthsToMonthStart,
  dateLabel,
  dayHeading,
  isIsoDate,
  monthLabel,
  monthName,
  monthStart,
  todayIso,
} from '@/lib/dates'

describe('todayIso', () => {
  it('answers in Ho Chi Minh City, not in UTC', () => {
    // 23:30 UTC on the 24th is already half past six on the 25th in Vietnam.
    expect(todayIso(new Date('2026-08-24T23:30:00Z'))).toBe('2026-08-25')
    expect(todayIso(new Date('2026-08-24T16:00:00Z'))).toBe('2026-08-24')
    // And 17:00 UTC is midnight, the first minute of the next day.
    expect(todayIso(new Date('2026-08-24T17:00:00Z'))).toBe('2026-08-25')
  })
})

describe('month arithmetic', () => {
  it('finds the month start without touching a timezone', () => {
    expect(monthStart('2026-08-25')).toBe('2026-08-01')
    expect(monthStart('2026-01-01')).toBe('2026-01-01')
  })

  it('adds months across a year boundary', () => {
    expect(addMonthsToMonthStart('2026-11-20', 3)).toBe('2027-02-01')
    expect(addMonthsToMonthStart('2026-01-31', 23)).toBe('2027-12-01')
    expect(addMonthsToMonthStart('2026-03-15', 0)).toBe('2026-03-01')
  })

  it('names the month the budget switch talks about', () => {
    expect(monthName('2026-08-25')).toBe('August')
    expect(monthLabel('2026-08-25')).toBe('August 2026')
  })
})

describe('dayHeading', () => {
  const today = '2026-08-25'

  it('names today and yesterday', () => {
    expect(dayHeading('2026-08-25', today)).toBe('Today')
    expect(dayHeading('2026-08-24', today)).toBe('Yesterday')
  })

  it('drops the year within the current one and keeps it otherwise', () => {
    expect(dayHeading('2026-08-20', today)).toBe('Thu 20 Aug')
    expect(dayHeading('2025-12-31', today)).toBe('Wed 31 Dec 2025')
  })
})

describe('helpers', () => {
  it('shifts days across a month boundary', () => {
    expect(addDays('2026-03-01', -1)).toBe('2026-02-28')
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01')
  })

  it('labels a plain date', () => {
    expect(dateLabel('2026-08-05')).toBe('5 Aug 2026')
  })

  it('recognises the shape Postgres sends', () => {
    expect(isIsoDate('2026-08-05')).toBe(true)
    expect(isIsoDate('2026-8-5')).toBe(false)
    expect(isIsoDate('')).toBe(false)
  })
})
