/**
 * The budget arc. docs/03-DESIGN.md, signature element 2.
 *
 *   "Monthly budget as a 240 degree tachometer arc, not a bar. Tick marks every
 *    10%. The needle sweeps in on load (600ms, once, then never again during the
 *    session). Past 100% the arc segment turns --fire-ember and the ticks beyond
 *    redline get slightly denser — no shaking, no colour flashing, no alarm. The
 *    car metaphor does the emotional work on its own."
 *
 * The dial reads to 125% of the budget, not to 100%, and that is the whole
 * reason it is a tachometer rather than a ring. A dial that ended at its redline
 * would have nowhere to put a needle that has gone past it, and "past the
 * redline" is the one state this graphic exists to make legible. So 100% sits at
 * four fifths of the sweep, the last fifth is the overspend zone, its ticks are
 * twice as dense, and a needle in it is doing exactly what a needle in that part
 * of a rev counter does. Nothing flashes. Nothing shakes.
 *
 * A Server Component emitting SVG, so the arc costs no client JavaScript beyond
 * the handful of lines that remember it has swept, and it renders with scripting
 * off. The sweep is two CSS animations declared in globals.css: the coloured
 * segment draws itself in with `stroke-dashoffset` and the needle rotates from
 * zero to its angle. Both are written so their final state is also their static
 * state, which is what makes reduced motion correct rather than merely quiet —
 * the global `prefers-reduced-motion` rule collapses the duration to nothing and
 * the needle is already where it belongs.
 *
 * "Once, then never again during the session" is decided here, on the server,
 * from a session cookie. See `arc-session.ts` for why it is not decided in the
 * browser.
 */

import { cookies } from 'next/headers'
import type { CSSProperties } from 'react'

import { ARC_SWEPT_COOKIE } from '@/components/budget/arc-session'
import { MarkArcSwept } from '@/components/budget/mark-arc-swept'
import { budgetState, BUDGET_STATE_COLOUR } from '@/lib/budgets/types'

/** 240 degrees, from lower-left round the top to lower-right. */
const START = 150
const SWEEP = 240

/** The dial reads this far. 100% lands at four fifths of the sweep. */
const DIAL_MAX = 1.25

const CX = 100
const CY = 92
const RADIUS = 74
const BAND = 10

/** Ticks live inside the band. The redline mark is longer and coloured. */
const TICK_OUTER = RADIUS - 8
const TICK_INNER = RADIUS - 14
const REDLINE_INNER = RADIUS - 18
const NEEDLE_TIP = RADIUS - 17
const NEEDLE_TAIL = 10

function point(angle: number, radius: number): { x: number; y: number } {
  const radians = (angle * Math.PI) / 180
  return { x: CX + radius * Math.cos(radians), y: CY + radius * Math.sin(radians) }
}

function pair(angle: number, radius: number): string {
  const { x, y } = point(angle, radius)
  return `${x.toFixed(2)} ${y.toFixed(2)}`
}

const ARC = `M ${pair(START, RADIUS)} A ${RADIUS} ${RADIUS} 0 1 1 ${pair(START + SWEEP, RADIUS)}`

/** Where on the dial a fraction of the budget sits, in degrees from the start. */
function sweepFor(fraction: number): number {
  return (Math.min(Math.max(fraction, 0), DIAL_MAX) / DIAL_MAX) * SWEEP
}

/**
 * Every 10% up to the redline, every 5% past it. The density change is the
 * design's, and it is the only thing that marks the overspend zone when the
 * needle is nowhere near it.
 */
function ticks(): { fraction: number; dense: boolean }[] {
  const marks: { fraction: number; dense: boolean }[] = []
  for (let step = 0; step <= 10; step += 1) marks.push({ fraction: step / 10, dense: false })
  for (let step = 21; step <= 25; step += 1) marks.push({ fraction: step / 20, dense: true })
  return marks
}

type BudgetArcProps = {
  /** Spent over budget. 0.84 is 84% of the month's figure gone.  */
  fraction: number
  /** Says what the dial means, because a shape on its own is not a label. */
  label: string
  /** The reading in the middle: "84%". Formatted by the caller. */
  reading: string
  /** One word under it: "of budget", "over". */
  caption: string
  size?: number
}

export async function BudgetArc({
  fraction,
  label,
  reading,
  caption,
  size = 208,
}: BudgetArcProps) {
  const swept = (await cookies()).has(ARC_SWEPT_COOKIE)
  const state = budgetState({ budget_amount: 1, used_fraction: fraction })
  const colour = BUDGET_STATE_COLOUR[state]
  const angle = sweepFor(fraction)
  // pathLength is pinned to 100 so the dash arithmetic is a percentage and does
  // not have to know the radius.
  const length = (angle / SWEEP) * 100

  return (
    <>
      <svg
        viewBox="0 0 200 140"
        width={size}
        height={(size * 140) / 200}
        role="img"
        aria-label={label}
        className={swept ? 'shrink-0' : 'arc-sweep shrink-0'}
        style={
          {
            '--arc-length': length.toFixed(2),
            '--arc-angle': `${angle.toFixed(2)}deg`,
          } as CSSProperties
        }
      >
        <path d={ARC} fill="none" stroke="var(--rule)" strokeWidth={BAND} strokeLinecap="round" />

        <g strokeLinecap="butt">
          {ticks().map((tick) => {
            const at = START + sweepFor(tick.fraction)
            const redline = tick.fraction === 1
            const inner = redline ? REDLINE_INNER : TICK_INNER
            const from = point(at, inner)
            const to = point(at, TICK_OUTER)
            return (
              <line
                key={tick.fraction}
                x1={from.x.toFixed(2)}
                y1={from.y.toFixed(2)}
                x2={to.x.toFixed(2)}
                y2={to.y.toFixed(2)}
                stroke={redline ? 'var(--critical)' : 'var(--rule-strong)'}
                strokeWidth={redline ? 2.5 : tick.dense ? 1 : 1.5}
              />
            )
          })}
        </g>

        <path
          className="arc-fill"
          d={ARC}
          fill="none"
          stroke={colour}
          strokeWidth={BAND}
          strokeLinecap="round"
          pathLength={100}
          strokeDasharray={`${length.toFixed(2)} 100`}
        />

        {/* Drawn at the zero position and rotated into place, so the animation and
            the resting state are the same declaration. */}
        <g className="arc-needle">
          <line
            x1={point(START + 180, NEEDLE_TAIL).x.toFixed(2)}
            y1={point(START + 180, NEEDLE_TAIL).y.toFixed(2)}
            x2={point(START, NEEDLE_TIP).x.toFixed(2)}
            y2={point(START, NEEDLE_TIP).y.toFixed(2)}
            stroke="var(--text)"
            strokeWidth={2.5}
            strokeLinecap="round"
          />
          <circle cx={CX} cy={CY} r={5} fill="var(--surface)" stroke="var(--text)" strokeWidth={2} />
        </g>

        {/* The reading sits in the dial's own middle. Mono and tabular, like every
            number in this app — the per-cent sign is in the subset. */}
        <text
          x={CX}
          y={CY + 10}
          textAnchor="middle"
          fill="var(--text)"
          style={{ font: '500 30px var(--font-mono)', fontVariantNumeric: 'tabular-nums' }}
        >
          {reading}
        </text>
        <text
          x={CX}
          y={CY + 28}
          textAnchor="middle"
          fill="var(--text-muted)"
          style={{ font: '400 12px var(--font-body)' }}
        >
          {caption}
        </text>
      </svg>
      {swept ? null : <MarkArcSwept />}
    </>
  )
}
