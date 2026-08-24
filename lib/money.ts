/**
 * Money, in integer minor units.
 *
 * Every amount in this app is a whole number of the smallest unit its currency
 * has. VND has no minor unit at all, so 150.000 dong is the integer `150000`.
 * USD has two decimal places, so $1,234.56 is the integer `123456`. Nothing here
 * ever produces a fractional amount, and nothing here reads a hardcoded number
 * of decimal places -- the exponent always comes from the lookup table below.
 *
 * See CLAUDE.md section 5.
 */

export type CurrencyCode = string

export const DEFAULT_CURRENCY: CurrencyCode = 'VND'
export const DEFAULT_LOCALE = 'vi-VN'

/**
 * ISO 4217 minor-unit exponents, listed only where they differ from 2.
 * A currency that is not here is assumed to have two decimal places, which is
 * true of the overwhelming majority.
 */
const CURRENCY_EXPONENTS: Readonly<Record<string, number>> = {
  // No minor unit.
  BIF: 0,
  CLP: 0,
  DJF: 0,
  GNF: 0,
  ISK: 0,
  JPY: 0,
  KMF: 0,
  KRW: 0,
  PYG: 0,
  RWF: 0,
  UGX: 0,
  UYI: 0,
  VND: 0,
  VUV: 0,
  XAF: 0,
  XOF: 0,
  XPF: 0,
  // Three decimal places.
  BHD: 3,
  IQD: 3,
  JOD: 3,
  KWD: 3,
  LYD: 3,
  OMR: 3,
  TND: 3,
  // Four decimal places.
  CLF: 4,
  UYW: 4,
}

const FALLBACK_EXPONENT = 2

/** How many decimal places this currency has. */
export function currencyExponent(currency: CurrencyCode = DEFAULT_CURRENCY): number {
  return CURRENCY_EXPONENTS[currency.toUpperCase()] ?? FALLBACK_EXPONENT
}

/** How many minor units make one major unit. 1 for VND, 100 for USD. */
export function minorPerMajor(currency: CurrencyCode = DEFAULT_CURRENCY): number {
  return 10 ** currencyExponent(currency)
}

/** True if the currency has no decimal places at all. */
export function isZeroDecimal(currency: CurrencyCode = DEFAULT_CURRENCY): boolean {
  return currencyExponent(currency) === 0
}

// ---------------------------------------------------------------------------
// Minor-unit arithmetic
//
// These exist so that a stray float can never enter through a `+`. They are
// deliberately boring.
// ---------------------------------------------------------------------------

export function isMinorAmount(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value)
}

export function assertMinorAmount(value: number, label = 'amount'): number {
  if (!isMinorAmount(value)) {
    throw new TypeError(`${label} must be a safe integer number of minor units, got ${String(value)}`)
  }
  return value
}

export function addMinor(a: number, b: number): number {
  return assertMinorAmount(assertMinorAmount(a, 'a') + assertMinorAmount(b, 'b'), 'sum')
}

export function subtractMinor(a: number, b: number): number {
  return assertMinorAmount(assertMinorAmount(a, 'a') - assertMinorAmount(b, 'b'), 'difference')
}

export function negateMinor(a: number): number {
  return -assertMinorAmount(a)
}

export function absMinor(a: number): number {
  return Math.abs(assertMinorAmount(a))
}

export function sumMinor(values: Iterable<number>): number {
  let total = 0
  for (const value of values) total += assertMinorAmount(value)
  return assertMinorAmount(total, 'total')
}

/**
 * Multiply by a real factor and land back on a whole minor unit.
 * Halves round away from zero, so a refund of half of 5 is 3 out and 3 back.
 */
export function scaleMinor(amount: number, factor: number): number {
  assertMinorAmount(amount)
  if (!Number.isFinite(factor)) throw new TypeError(`factor must be finite, got ${String(factor)}`)
  const scaled = amount * factor
  const rounded = scaled < 0 ? -Math.round(-scaled) : Math.round(scaled)
  return assertMinorAmount(rounded, 'scaled amount')
}

/**
 * Split an amount into `parts` whole slices whose sum is exactly the amount.
 * The remainder lands on the first slice: 100 over 3 is 34, 33, 33.
 *
 * This is the same rule as `v_expense_impact` in the database, including for
 * negative amounts, because Postgres integer division and JavaScript's
 * `Math.trunc` both truncate toward zero and `%` keeps the sign of the dividend.
 */
export function splitMinor(amount: number, parts: number): number[] {
  assertMinorAmount(amount)
  if (!Number.isInteger(parts) || parts < 1) {
    throw new RangeError(`parts must be a positive integer, got ${String(parts)}`)
  }
  const remainder = amount % parts
  // Exact: `amount - remainder` is divisible by `parts` and both are safe integers.
  const base = (amount - remainder) / parts
  const slices = new Array<number>(parts).fill(base)
  slices[0] = base + remainder
  return slices
}

/** Convert a major-unit number (1234.56) into minor units (123456). */
export function toMinor(major: number, currency: CurrencyCode = DEFAULT_CURRENCY): number {
  if (!Number.isFinite(major)) throw new TypeError(`major must be finite, got ${String(major)}`)
  const scaled = major * minorPerMajor(currency)
  const rounded = scaled < 0 ? -Math.round(-scaled) : Math.round(scaled)
  return assertMinorAmount(rounded, 'minor amount')
}

/**
 * Convert minor units back to a major-unit number. Lossy by nature -- use it for
 * formatting and charts, never to store or to add.
 */
export function toMajor(minor: number, currency: CurrencyCode = DEFAULT_CURRENCY): number {
  return assertMinorAmount(minor) / minorPerMajor(currency)
}

// ---------------------------------------------------------------------------
// Formatting
// ---------------------------------------------------------------------------

export type FormatMoneyOptions = {
  locale?: string
  /** Drop the currency symbol and return digits only. */
  withSymbol?: boolean
  signDisplay?: 'auto' | 'always' | 'never' | 'exceptZero'
}

/**
 * Intl separates the number from the symbol with a non-breaking space. Keeping
 * it would mean every comparison in a test or a snapshot has to know that, so it
 * is normalised to an ordinary space and the no-wrap job is left to CSS.
 */
function normaliseSpaces(text: string): string {
  return text.replace(/[\u00a0\u202f]/g, ' ')
}

/**
 * `150000` in VND becomes `150.000 dong-sign`. Thousands are grouped with dots,
 * there are no decimals, and the symbol trails -- all of which fall out of the
 * vi-VN locale plus the exponent from the table above.
 */
export function formatMoney(
  minor: number,
  currency: CurrencyCode = DEFAULT_CURRENCY,
  options: FormatMoneyOptions = {},
): string {
  assertMinorAmount(minor)
  const { locale = DEFAULT_LOCALE, withSymbol = true, signDisplay = 'auto' } = options
  const exponent = currencyExponent(currency)
  const value = toMajor(minor, currency)

  const formatter = new Intl.NumberFormat(locale, {
    ...(withSymbol ? { style: 'currency' as const, currency: currency.toUpperCase() } : {}),
    minimumFractionDigits: exponent,
    maximumFractionDigits: exponent,
    signDisplay,
  })

  return normaliseSpaces(formatter.format(value))
}

/** The same number without the currency symbol -- for inputs and tight columns. */
export function formatAmount(
  minor: number,
  currency: CurrencyCode = DEFAULT_CURRENCY,
  options: Omit<FormatMoneyOptions, 'withSymbol'> = {},
): string {
  return formatMoney(minor, currency, { ...options, withSymbol: false })
}

// ---------------------------------------------------------------------------
// Parsing
//
// The amount field accepts what someone would actually type on a phone:
// `150k`, `1.2m`, `150.000`, `150000`, with or without a currency sign, with or
// without spaces. Anything it cannot read with confidence returns null so the
// form can say so rather than guess.
// ---------------------------------------------------------------------------

/** k, m and b, as powers of ten. */
const MULTIPLIER_POWERS: Readonly<Record<string, number>> = { k: 3, m: 6, b: 9 }

const CURRENCY_SIGNS = /[₫$€£¥₩₹₽₿₦฿]/g
const WHITESPACE = /[\s\u00a0\u202f\ufeff]/g
const SHAPE = /^([+-]?)([0-9]+(?:[.,][0-9]+)*)([kmb]?)$/i

/** Longest run of digits we will look at. Beyond this it is not a real amount. */
const MAX_DIGITS = 21

/**
 * Collapse a grouped integer such as `1.234.567` to `1234567`.
 * Returns null if the grouping is not consistent, which is how `1.2.3` is
 * rejected rather than silently read as 123.
 */
function ungroup(text: string): string | null {
  const separators = text.match(/[.,]/g)
  if (!separators) return /^[0-9]+$/.test(text) ? text : null

  const separator = separators[0]
  if (separators.some((character) => character !== separator)) return null

  const groups = text.split(separator)
  const first = groups[0]
  if (first === undefined || first.length < 1 || first.length > 3) return null
  // `0.005` is not a grouped five. A leading group of zero gives it away.
  if (groups.length > 1 && first.startsWith('0')) return null
  for (let index = 1; index < groups.length; index += 1) {
    if (groups[index]?.length !== 3) return null
  }
  return groups.join('')
}

/**
 * Read a typed amount into minor units, or null if it cannot be read.
 *
 * The one genuinely ambiguous case is a single separator followed by three
 * digits -- `150.000`. It is resolved by the currency: with no decimal places
 * the separator can only be grouping, so VND reads it as one hundred and fifty
 * thousand, while USD reads `150.000` as a grouped one hundred and fifty
 * thousand dollars too, because three digits is one more than that currency
 * has room for. `150.00` in USD is a decimal and reads as $150.
 */
export function parseAmount(input: string, currency: CurrencyCode = DEFAULT_CURRENCY): number | null {
  if (typeof input !== 'string') return null

  const code = currency.toUpperCase()
  let text = input.normalize('NFKC').replace(WHITESPACE, '')
  if (text === '') return null

  text = text.replace(CURRENCY_SIGNS, '')
  text = text.replace(new RegExp(`^${code}|${code}$`, 'i'), '')
  if (text === '') return null

  const shape = SHAPE.exec(text)
  if (!shape) return null

  const [, sign = '', body = '', suffix = ''] = shape
  const multiplierPower = suffix ? (MULTIPLIER_POWERS[suffix.toLowerCase()] ?? 0) : 0
  const exponent = currencyExponent(code)

  const separators = body.match(/[.,]/g) ?? []

  let wholeText = body
  let fraction = ''

  if (separators.length > 0) {
    const last = separators[separators.length - 1] as string
    const lastIndex = body.lastIndexOf(last)
    const tail = body.slice(lastIndex + 1)
    const allSame = separators.every((character) => character === last)

    // A shorthand suffix settles it: `1.2m` is one and a fifth million, always.
    // Otherwise a repeated single separator is grouping and a mixed pair puts
    // the decimal last. A lone separator is the only genuinely ambiguous case:
    // three digits after it is read as grouping, fewer is a fraction, and more
    // can only be a fraction because no group is four digits long. In a currency
    // with no decimal places a fraction is meaningless, so that reads as null.
    let lastIsDecimal: boolean
    if (multiplierPower > 0) {
      lastIsDecimal = true
    } else if (separators.length > 1) {
      lastIsDecimal = !allSame
    } else if (tail.length === 3) {
      lastIsDecimal = false
    } else if (tail.length <= exponent) {
      lastIsDecimal = true
    } else if (exponent > 0) {
      lastIsDecimal = true
    } else {
      return null
    }

    if (lastIsDecimal) {
      const whole = ungroup(body.slice(0, lastIndex))
      if (whole === null) return null
      wholeText = whole
      fraction = tail
    } else {
      const whole = ungroup(body)
      if (whole !== null) {
        wholeText = whole
      } else if (exponent > 0) {
        // Not a valid grouping after all, so read it as a fraction instead.
        const head = ungroup(body.slice(0, lastIndex))
        if (head === null) return null
        wholeText = head
        fraction = tail
      } else {
        return null
      }
    }
  }

  const digits = wholeText + fraction
  if (digits.length === 0 || digits.length > MAX_DIGITS) return null

  // Scale exactly, in BigInt, so no float ever touches the value.
  const scale = multiplierPower + exponent - fraction.length
  let minor = BigInt(digits)
  if (scale >= 0) {
    minor *= 10n ** BigInt(scale)
  } else {
    const divisor = 10n ** BigInt(-scale)
    const quotient = minor / divisor
    const remainder = minor % divisor
    minor = remainder * 2n >= divisor ? quotient + 1n : quotient
  }
  if (sign === '-') minor = -minor

  if (minor > BigInt(Number.MAX_SAFE_INTEGER) || minor < BigInt(Number.MIN_SAFE_INTEGER)) return null
  return Number(minor)
}

/**
 * What the form shows underneath the amount field while it is being typed, so
 * the parse can never be a surprise. Null input, null output -- the hint hides.
 */
export function parsedAmountHint(
  input: string,
  currency: CurrencyCode = DEFAULT_CURRENCY,
  locale: string = DEFAULT_LOCALE,
): string | null {
  const minor = parseAmount(input, currency)
  return minor === null ? null : formatMoney(minor, currency, { locale })
}
