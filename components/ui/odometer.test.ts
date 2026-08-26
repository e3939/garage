import { describe, expect, it } from 'vitest'

import { isGroupSeparator } from '@/components/ui/odometer'

/**
 * The drum gap replaces a thousands separator with a hairline seam, and must
 * not replace a decimal point: a seam through the middle of `12.50` would be
 * saying the number is twelve thousand five hundred.
 *
 * The figure arrives already formatted, so the only thing available is the
 * shape of the string. Three digits after it and nothing else attached is a
 * group; anything else is not.
 */
function gaps(value: string): number[] {
  const chars = [...value]
  return chars.map((_char, index) => index).filter((index) => isGroupSeparator(chars, index))
}

describe('isGroupSeparator', () => {
  it('finds both seams in a dong amount', () => {
    // 1.234.567 ₫ — after "1" and after "1.234".
    expect(gaps('1.234.567 ₫')).toEqual([1, 5])
  })

  it('finds the seam in the smallest grouped figure', () => {
    expect(gaps('150.000 ₫')).toEqual([3])
  })

  it('leaves a two-decimal amount alone', () => {
    expect(gaps('$150.00')).toEqual([])
    expect(gaps('12.50')).toEqual([])
  })

  it('separates the groups but not the decimals of a mixed figure', () => {
    // 1,234.56 in en-US: the comma groups, the point divides.
    expect(gaps('1,234.56')).toEqual([1])
  })

  it('handles the other way round, as de-DE writes it', () => {
    expect(gaps('1.234,56')).toEqual([1])
  })

  it('ignores a separator with nothing in front of it', () => {
    expect(gaps('.000')).toEqual([])
  })

  it('ignores a run of four digits, which is no thousands group', () => {
    expect(gaps('1.2345')).toEqual([])
  })

  it('finds nothing in a figure that has no separator', () => {
    expect(gaps('999 ₫')).toEqual([])
    expect(gaps('')).toEqual([])
  })

  it('handles a negative amount', () => {
    expect(gaps('-1.500.000 ₫')).toEqual([2, 6])
  })
})
