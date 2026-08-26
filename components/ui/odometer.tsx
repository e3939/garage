// The roll compares the figure on screen with the one that just arrived, so it
// has to remember what it was showing.
'use client'

import { useState, type CSSProperties } from 'react'

/** docs/03-DESIGN.md: staggered 20ms right-to-left. */
const STAGGER_MS = 20

const DIGITS = new Set(['0', '1', '2', '3', '4', '5', '6', '7', '8', '9'])

function isDigit(char: string | undefined): boolean {
  return char !== undefined && DIGITS.has(char)
}

/**
 * Whether the character at `index` is a thousands separator rather than a
 * decimal point.
 *
 * The figure arrives already formatted by `lib/money.ts`, so which character
 * groups and which one divides is the locale's business and not this
 * component's. What can be told from the string itself is the shape: a group
 * separator is followed by exactly three digits and then by something that is
 * not a digit. `150.000` groups; `150.00` and `1,2345` do not. That keeps the
 * drum gaps off the decimal point of a two-decimal currency, where a seam would
 * be saying something untrue about the number.
 */
export function isGroupSeparator(chars: readonly string[], index: number): boolean {
  const char = chars[index]
  if (char !== '.' && char !== ',') return false
  if (!isDigit(chars[index - 1])) return false

  let run = 0
  while (isDigit(chars[index + 1 + run])) run += 1
  return run === 3 && !isDigit(chars[index + 4])
}

type OdometerProps = {
  /** The figure, already formatted. */
  value: string
  className?: string
}

/**
 * The odometer strip's digits. docs/03-DESIGN.md, signature element 1.
 *
 * One cell per character. A cell that has changed since the last render holds
 * the old character above the new one and rolls up by exactly one, 120ms each,
 * staggered 20ms from the right — so a figure that gains a digit rolls the way a
 * mechanical counter does, the units first and the leading digit last. Cells
 * that did not change do not move; a whole strip animating every time one digit
 * ticks is a fruit machine.
 *
 * A thousands separator is not printed. It becomes a hairline seam, which is
 * what the design means by a counter's drum gaps.
 *
 * The whole drum is `aria-hidden` and the figure is repeated for a screen
 * reader beside it, because a row of one-character boxes is read out one
 * character at a time.
 */
type Roll = {
  /** The figure this render is showing. */
  shown: string
  /** The one it was showing a moment ago, which is what rolls away. */
  previous: string
  /** Bumped on every change, so a cell that rolls twice animates twice. */
  generation: number
}

export function Odometer({ value, className = '' }: OdometerProps) {
  const [state, setState] = useState<Roll>(() => ({
    shown: value,
    previous: value,
    generation: 0,
  }))

  // Adjusting state during render rather than in an effect: the new figure and
  // the roll that carries it belong to the same paint. The same pattern the
  // timeline feed uses when a fresh server page lands under it. The rendering
  // below reads the local value rather than the hook's, because the re-render
  // this schedules has not happened yet.
  let roll = state
  if (state.shown !== value) {
    roll = { shown: value, previous: state.shown, generation: state.generation + 1 }
    setState(roll)
  }

  const generation = roll.generation
  const chars = [...value]
  const before = [...roll.previous]
  // Aligned from the right: a figure that gains a digit should roll its units
  // column against its old units column, not against its old tens.
  const offset = chars.length - before.length

  return (
    <span className={`odometer ${className}`}>
      <span className="sr-only">{value}</span>
      <span aria-hidden className="odometer">
        {chars.map((char, index) => {
          const key = `${index}-${chars.length}`

          if (isGroupSeparator(chars, index)) {
            return <span key={key} className="odometer-gap" />
          }

          const was = before[index - offset]
          const rolling = generation > 0 && was !== undefined && was !== char

          if (!rolling) {
            return (
              <span key={key} className="odometer-cell">
                <span className="odometer-ghost">{char}</span>
                <span className="odometer-window">
                  <span className="block">{char}</span>
                </span>
              </span>
            )
          }

          return (
            <span key={key} className="odometer-cell">
              <span className="odometer-ghost">{char}</span>
              <span className="odometer-window">
                {/* Keyed by the generation so React replaces the element and
                    the animation runs again rather than being already spent. */}
                <span
                  key={generation}
                  className="odometer-roll"
                  style={
                    {
                      '--roll-delay': `${(chars.length - 1 - index) * STAGGER_MS}ms`,
                    } as CSSProperties
                  }
                >
                  <span className="block">{was}</span>
                  <span className="block">{char}</span>
                </span>
              </span>
            </span>
          )
        })}
      </span>
    </span>
  )
}
