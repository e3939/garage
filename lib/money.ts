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
// Live formatting for the amount field
//
// The field groups thousands as you type, using the same separator
// `formatMoney` uses, so the number in the input and the number in the ledger
// agree character for character. This is a display change only: `parseAmount`
// below is untouched and its ambiguity rules still decide what a string means.
// ---------------------------------------------------------------------------

/**
 * The group and decimal characters this currency and locale actually use.
 *
 * Taken from `Intl` rather than hardcoded, for the same reason the exponent is:
 * vi-VN groups with a dot and points with a comma, en-US does the reverse, and
 * fr-FR groups with a narrow no-break space.
 */
export function amountSeparators(
  currency: CurrencyCode = DEFAULT_CURRENCY,
  locale = DEFAULT_LOCALE,
): { group: string; decimal: string } {
  const exponent = currencyExponent(currency)

  const grouped = new Intl.NumberFormat(locale, {
    minimumFractionDigits: exponent,
    maximumFractionDigits: exponent,
    useGrouping: true,
  }).formatToParts(1111111)

  // A zero-decimal currency never prints a decimal part, so the decimal
  // character has to come from a formatter that does.
  const pointed = new Intl.NumberFormat(locale, {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  }).formatToParts(1.1)

  return {
    group: grouped.find((part) => part.type === 'group')?.value ?? ',',
    decimal: pointed.find((part) => part.type === 'decimal')?.value ?? '.',
  }
}

/** `1234567` -> `1.234.567`, from the right, in threes. */
function groupDigits(digits: string, group: string): string {
  if (digits.length <= 3) return digits
  let out = ''
  for (let index = digits.length; index > 0; index -= 3) {
    const start = Math.max(0, index - 3)
    out = digits.slice(start, index) + (out ? group + out : '')
  }
  return out
}

/**
 * What the amount field should show for what has been typed.
 *
 * The rules exist because of how people actually type, and they deliberately
 * mirror `parseAmount` below rather than inventing a second opinion — what the
 * field shows and what the parser reads have to agree.
 *
 * **A shorthand suffix stops it dead.** `150k` and `1.2m` are left exactly as
 * typed. Grouping them would insert separators the parser would then have to
 * read as grouping, and the dot in `1.2m` is a decimal point.
 *
 * **The last separator decides.** Exactly three digits after it is grouping, so
 * `150.000` regroups to `150.000` and `24.000.000` survives a round trip.
 * Anything else is a decimal point, so `1.2` keeps its dot and stays `1.2` —
 * which is what makes `1.2m` reachable at all, because the `m` does not exist
 * yet while the dot is being typed. That is the same test `parseAmount` applies
 * to the same string.
 *
 * **Only digits left of that point are grouped.** The separator and everything
 * after it are passed through untouched, so nothing anyone types is destroyed:
 * the only characters this function adds or removes are group separators in
 * grouping positions.
 *
 * **Leading zeros go.** `0150` becomes `150`, and `0000` becomes `0` rather
 * than `0.000`, which the parser rejects — a grouped value whose first group is
 * a zero is exactly how `0.005` is kept from reading as five.
 */
export function formatAmountInput(
  raw: string,
  currency: CurrencyCode = DEFAULT_CURRENCY,
  locale = DEFAULT_LOCALE,
): string {
  if (raw === '') return ''
  if (/[kmb]/i.test(raw)) return raw

  const { group, decimal } = amountSeparators(currency, locale)

  const shape = /^([+-]?)([0-9.,\u00a0\u202f ]*)([\s\S]*)$/.exec(raw)
  if (!shape) return raw
  const [, sign = '', numeric = '', trailing = ''] = shape

  const separatorPositions: number[] = []
  for (let index = 0; index < numeric.length; index += 1) {
    const character = numeric[index] as string
    if (character < '0' || character > '9') separatorPositions.push(index)
  }

  let wholePart = numeric
  let fractionPart = ''

  if (separatorPositions.length > 0) {
    const last = separatorPositions[separatorPositions.length - 1] as number
    const character = numeric[last] as string
    const head = numeric.slice(0, last)
    const tail = numeric.slice(last + 1)

    // Whether the last separator is a decimal point or a group marker, decided
    // the same way twice over:
    //
    //   It is the locale's decimal character. `1,234.56` in en-US, and nothing
    //   more needs asking.
    //
    //   Or it is the group character but the string has the shape of a
    //   shorthand mantissa: one separator, a short whole part, one or two
    //   digits after it. That is `1.2` on its way to `1.2m`, in a locale where
    //   the dot is also how thousands are marked. Without this the dot is eaten
    //   as stray grouping and `1.2m` arrives at the parser as `12m`.
    //
    // Everything else is grouping, which is what keeps `2.400` regrouping to
    // `24.000` when another digit is typed onto the end of it.
    const isDecimalCharacter = character === decimal
    const isShorthandMantissa =
      separatorPositions.length === 1 &&
      /^[0-9]{1,3}$/.test(head) &&
      /^[0-9]{1,2}$/.test(tail)

    if (isDecimalCharacter || isShorthandMantissa || tail === '') {
      wholePart = head
      fractionPart = numeric.slice(last)
    }
  }

  const digits = wholePart.replace(/[^0-9]/g, '')
  if (digits === '') return sign + fractionPart + trailing

  const trimmed = digits.replace(/^0+(?=\d)/, '')
  return sign + groupDigits(trimmed, group) + fractionPart + trailing
}

/** Digits in a string, which is the only thing a caret should be measured in. */
function countDigits(text: string): number {
  let count = 0
  for (const character of text) if (character >= '0' && character <= '9') count += 1
  return count
}

/**
 * Where the caret goes after the field reformats.
 *
 * By digit count, never by character index. Inserting a separator shifts
 * everything to its right, so an index that was correct before the edit points
 * somewhere else after it -- which is why naive implementations of this send
 * the caret to the end and make the middle of a number impossible to edit.
 *
 * Counting digits is stable across any number of separators appearing or
 * disappearing: "three digits to my left" means the same thing before and
 * after.
 */
export function amountCaret(previous: string, caret: number, next: string): number {
  // Nothing was rewritten, so the browser already has the caret where the user
  // put it. Digit counting would drag it back off a trailing decimal point,
  // which is exactly where it belongs while `1.` is on its way to `1.2m`.
  if (previous === next) return Math.min(Math.max(0, caret), next.length)

  const target = countDigits(previous.slice(0, Math.max(0, caret)))
  if (target === 0) {
    // Before any digit: sit after a sign if there is one, otherwise at the very
    // start. Landing after a group separator would be a caret you cannot type
    // through.
    return /^[+-]/.test(next) ? 1 : 0
  }

  let seen = 0
  for (let index = 0; index < next.length; index += 1) {
    const character = next[index] as string
    if (character >= '0' && character <= '9') {
      seen += 1
      if (seen === target) return index + 1
    }
  }
  return next.length
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
