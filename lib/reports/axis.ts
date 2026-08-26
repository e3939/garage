/**
 * Axis labels for the report charts.
 *
 * A dong figure is long. `20.000.000 ₫` is thirteen characters, and three of
 * those down the left-hand edge of a 340-unit chart leaves nothing to draw in.
 * So the axis is scaled once, the scale is stated in words next to it, and the
 * labels themselves stay short enough to set in tabular mono — which is what
 * every number in this app is set in, axis labels included.
 *
 * The alternative was `Intl`'s compact notation, which renders 20,000,000 dong
 * as "20 Tr" in vi-VN. That is genuinely idiomatic Vietnamese, and it is also
 * two letters, and the mono subset this app ships contains digits, punctuation
 * and currency signs and no letters at all (`scripts/subset-mono.mjs`). An axis
 * label that silently falls back to the system monospace is worse than a longer
 * one that does not.
 */

import { toMajor, type CurrencyCode } from '@/lib/money'

export type AxisScale = {
  /** Divide a major-unit figure by this before printing it. */
  divisor: number
  /** What the divisor means, for the caption next to the axis. Empty at 1. */
  unit: '' | 'thousands' | 'millions' | 'billions'
}

const STEPS: readonly { at: number; scale: AxisScale }[] = [
  { at: 1_000_000_000, scale: { divisor: 1_000_000_000, unit: 'billions' } },
  { at: 1_000_000, scale: { divisor: 1_000_000, unit: 'millions' } },
  { at: 1_000, scale: { divisor: 1_000, unit: 'thousands' } },
]

/**
 * Pick a scale from the largest figure on the chart. A month of dong lands in
 * millions; a month of dollars lands in thousands; a chart of nothing stays at
 * one and prints a zero.
 */
export function axisScale(maxMinor: number, currency: CurrencyCode): AxisScale {
  const major = Math.abs(toMajor(maxMinor, currency))
  return STEPS.find((step) => major >= step.at)?.scale ?? { divisor: 1, unit: '' }
}

/**
 * One label. At most one decimal place, and a trailing `.0` is dropped — an
 * axis that reads 0 / 10 / 20 is doing its job better than one reading
 * 0.0 / 10.0 / 20.0.
 */
export function axisLabel(minor: number, currency: CurrencyCode, scale: AxisScale): string {
  const value = toMajor(minor, currency) / scale.divisor
  const rounded = Math.round(value * 10) / 10
  return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1)
}

/**
 * A round ceiling for the axis, so the tallest bar does not touch the top and
 * the middle tick is a number somebody can read. Steps 1, 2 and 5 per decade,
 * which is the sequence every chart axis has used since paper.
 */
export function axisCeiling(maxMinor: number): number {
  if (maxMinor <= 0) return 0

  const magnitude = 10 ** Math.floor(Math.log10(maxMinor))
  for (const step of [1, 2, 5, 10]) {
    const candidate = step * magnitude
    if (candidate >= maxMinor) return candidate
  }
  return 10 * magnitude
}
