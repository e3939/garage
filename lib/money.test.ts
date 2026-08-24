import { describe, expect, it } from 'vitest'

import {
  DEFAULT_CURRENCY,
  addMinor,
  absMinor,
  assertMinorAmount,
  currencyExponent,
  formatAmount,
  formatMoney,
  isZeroDecimal,
  minorPerMajor,
  negateMinor,
  parseAmount,
  parsedAmountHint,
  scaleMinor,
  splitMinor,
  subtractMinor,
  sumMinor,
  toMajor,
  toMinor,
} from '@/lib/money'

describe('currency exponents', () => {
  it('comes from the table, not from a constant', () => {
    expect(currencyExponent('VND')).toBe(0)
    expect(currencyExponent('JPY')).toBe(0)
    expect(currencyExponent('KRW')).toBe(0)
    expect(currencyExponent('USD')).toBe(2)
    expect(currencyExponent('EUR')).toBe(2)
    expect(currencyExponent('KWD')).toBe(3)
    expect(currencyExponent('CLF')).toBe(4)
  })

  it('defaults an unlisted currency to two decimal places', () => {
    expect(currencyExponent('ZZZ')).toBe(2)
  })

  it('is case insensitive', () => {
    expect(currencyExponent('vnd')).toBe(0)
  })

  it('defaults to VND', () => {
    expect(DEFAULT_CURRENCY).toBe('VND')
    expect(currencyExponent()).toBe(0)
    expect(minorPerMajor()).toBe(1)
    expect(minorPerMajor('USD')).toBe(100)
    expect(isZeroDecimal('VND')).toBe(true)
    expect(isZeroDecimal('USD')).toBe(false)
  })
})

describe('minor-unit arithmetic', () => {
  it('adds, subtracts, negates and sums', () => {
    expect(addMinor(150_000, 50_000)).toBe(200_000)
    expect(subtractMinor(150_000, 200_000)).toBe(-50_000)
    expect(negateMinor(150_000)).toBe(-150_000)
    expect(absMinor(-150_000)).toBe(150_000)
    expect(sumMinor([150_000, -50_000, 1])).toBe(100_001)
    expect(sumMinor([])).toBe(0)
  })

  it('refuses anything that is not a whole number of minor units', () => {
    expect(() => assertMinorAmount(1.5)).toThrow(TypeError)
    expect(() => addMinor(1.5, 1)).toThrow(TypeError)
    expect(() => assertMinorAmount(Number.NaN)).toThrow(TypeError)
    expect(() => assertMinorAmount(Number.MAX_SAFE_INTEGER + 2)).toThrow(TypeError)
  })

  it('scales and lands on a whole minor unit, halves away from zero', () => {
    expect(scaleMinor(100, 0.5)).toBe(50)
    expect(scaleMinor(101, 0.5)).toBe(51)
    expect(scaleMinor(-101, 0.5)).toBe(-51)
    expect(scaleMinor(150_000, 3)).toBe(450_000)
  })
})

describe('major and minor conversion', () => {
  it('is a no-op for a zero-decimal currency', () => {
    expect(toMinor(150_000, 'VND')).toBe(150_000)
    expect(toMajor(150_000, 'VND')).toBe(150_000)
  })

  it('shifts by two places for a two-decimal currency', () => {
    expect(toMinor(1234.56, 'USD')).toBe(123_456)
    expect(toMajor(123_456, 'USD')).toBe(1234.56)
  })

  it('shifts by three places for a three-decimal currency', () => {
    expect(toMinor(1.234, 'KWD')).toBe(1234)
  })

  it('rounds halves away from zero rather than toward even', () => {
    expect(toMinor(0.005, 'USD')).toBe(1)
    expect(toMinor(-0.005, 'USD')).toBe(-1)
  })
})

describe('splitMinor', () => {
  it('puts the remainder on the first slice', () => {
    expect(splitMinor(100, 3)).toEqual([34, 33, 33])
  })

  it('splits one over twelve as a single unit in the first month', () => {
    expect(splitMinor(1, 12)).toEqual([1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0])
  })

  it('mirrors the sign for negative amounts', () => {
    expect(splitMinor(-100, 3)).toEqual([-34, -33, -33])
    expect(splitMinor(-1, 12)).toEqual([-1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0])
  })

  it('always sums back to the original amount', () => {
    for (const amount of [0, 1, -1, 100, -100, 999_999, -999_999, 24_000_000]) {
      for (const parts of [1, 2, 3, 7, 12, 24, 120]) {
        expect(sumMinor(splitMinor(amount, parts))).toBe(amount)
        expect(splitMinor(amount, parts)).toHaveLength(parts)
      }
    }
  })

  it('is exact for a single slice', () => {
    expect(splitMinor(24_000_000, 1)).toEqual([24_000_000])
  })

  it('rejects a nonsense number of parts', () => {
    expect(() => splitMinor(100, 0)).toThrow(RangeError)
    expect(() => splitMinor(100, -3)).toThrow(RangeError)
    expect(() => splitMinor(100, 2.5)).toThrow(RangeError)
  })
})

describe('formatMoney', () => {
  it('formats VND with dot thousands separators, no decimals and a trailing sign', () => {
    expect(formatMoney(150_000, 'VND')).toBe('150.000 ₫')
    expect(formatMoney(1_200_000, 'VND')).toBe('1.200.000 ₫')
    expect(formatMoney(0, 'VND')).toBe('0 ₫')
  })

  it('keeps the minus sign in front for a refund', () => {
    expect(formatMoney(-150_000, 'VND')).toBe('-150.000 ₫')
  })

  it('defaults to VND', () => {
    expect(formatMoney(150_000)).toBe(formatMoney(150_000, 'VND'))
  })

  it('shows two decimals for a two-decimal currency', () => {
    expect(formatMoney(123_456, 'USD', { locale: 'en-US' })).toBe('$1,234.56')
  })

  it('shows three decimals for a three-decimal currency', () => {
    expect(formatMoney(1234, 'KWD', { locale: 'en-US' })).toContain('1.234')
  })

  it('drops the symbol on request', () => {
    expect(formatAmount(150_000, 'VND')).toBe('150.000')
    expect(formatAmount(123_456, 'USD', { locale: 'en-US' })).toBe('1,234.56')
  })

  it('never emits a non-breaking space', () => {
    expect(formatMoney(150_000, 'VND')).not.toContain(' ')
  })

  it('refuses a fractional amount', () => {
    expect(() => formatMoney(1.5, 'VND')).toThrow(TypeError)
  })
})

describe('parseAmount', () => {
  const cases: Array<[string, number | null]> = [
    // The shorthand the input field promises.
    ['150k', 150_000],
    ['150K', 150_000],
    ['1.2m', 1_200_000],
    ['1,2m', 1_200_000],
    ['1.2M', 1_200_000],
    ['2b', 2_000_000_000],
    // Written out, grouped and ungrouped.
    ['150.000', 150_000],
    ['150,000', 150_000],
    ['150000', 150_000],
    ['1.234.567', 1_234_567],
    ['150 000', 150_000],
    // Signs.
    ['-150k', -150_000],
    ['-150.000', -150_000],
    ['-1.2m', -1_200_000],
    ['+150k', 150_000],
    ['0', 0],
    ['-0', 0],
    // Currency noise the user did not bother to delete.
    ['150.000 ₫', 150_000],
    ['₫150.000', 150_000],
    ['150000 VND', 150_000],
    ['vnd 150k', 150_000],
    // Garbage.
    ['', null],
    ['   ', null],
    ['abc', null],
    ['k', null],
    ['-', null],
    ['1.2.3', null],
    ['12.34.567', null],
    ['150kk', null],
    ['1e6', null],
    ['150,000.00.0', null],
    ['NaN', null],
    ['₫', null],
    ['150k VND extra', null],
  ]

  it.each(cases)('reads %j as %j in VND', (input, expected) => {
    expect(parseAmount(input, 'VND')).toBe(expected)
  })

  it('reads the same digits differently for a zero-decimal and a two-decimal currency', () => {
    // Zero decimals: the dot can only be grouping.
    expect(parseAmount('150.000', 'VND')).toBe(150_000)
    // Two decimals: three digits is one too many for a fraction, so it is
    // grouping there too -- but the value is in cents.
    expect(parseAmount('150.000', 'USD')).toBe(15_000_000)
    // Two digits after the dot is a fraction.
    expect(parseAmount('150.00', 'USD')).toBe(15_000)
    expect(parseAmount('1,234.56', 'USD')).toBe(123_456)
    expect(parseAmount('1.234,56', 'VND')).toBe(1_235)
    // And in a currency with no fraction, two digits after a dot is not readable.
    expect(parseAmount('150.00', 'VND')).toBeNull()
  })

  it('rounds a fraction that is finer than the currency allows', () => {
    // Three digits after a lone separator is grouping, so this is $1,005.00.
    expect(parseAmount('1.005', 'USD')).toBe(100_500)
    // Four is unambiguously a fraction, and rounds to the cent.
    expect(parseAmount('1.0050', 'USD')).toBe(101)
    expect(parseAmount('0.005', 'USD')).toBe(1)
    expect(parseAmount('0.004', 'USD')).toBe(0)
    expect(parseAmount('1.2345', 'KWD')).toBe(1235)
  })

  it('handles shorthand in a two-decimal currency', () => {
    expect(parseAmount('1.5k', 'USD')).toBe(150_000)
    expect(parseAmount('150k', 'USD')).toBe(15_000_000)
  })

  it('refuses an amount too large to hold as a safe integer', () => {
    expect(parseAmount('999999999999999999999', 'VND')).toBeNull()
    expect(parseAmount('9999999999b', 'VND')).toBeNull()
  })

  it('defaults to VND', () => {
    expect(parseAmount('150k')).toBe(150_000)
  })
})

describe('parsedAmountHint', () => {
  it('shows the parsed value so the shorthand is never ambiguous', () => {
    expect(parsedAmountHint('150k', 'VND')).toBe('150.000 ₫')
    expect(parsedAmountHint('1.2m', 'VND')).toBe('1.200.000 ₫')
  })

  it('hides itself when there is nothing to show', () => {
    expect(parsedAmountHint('', 'VND')).toBeNull()
    expect(parsedAmountHint('abc', 'VND')).toBeNull()
  })
})
