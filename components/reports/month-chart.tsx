import { axisCeiling, axisLabel, axisScale } from '@/lib/reports/axis'
import type { MonthPoint } from '@/lib/reports/types'

/**
 * Month over month, with both views side by side.
 *
 * docs/01-PRODUCT.md keeps insisting that the same expenses produce more than
 * one honest figure, and this is the chart where that stops being an argument
 * and becomes a picture: a green bar for the monthly view — budget-affecting
 * spend, amortised across the months it was spread over — next to a grey one for
 * everything that actually left the account that month. A month with one big
 * purchase in it has a short green bar and a tall grey one, and the pair says
 * more than either could alone.
 *
 * **Why this is an SVG and not Recharts.** CLAUDE.md section 2 names Recharts.
 * A minimal Recharts bar chart — one grid, two axes, a tooltip, two series —
 * measured 102.8KB gzipped of route-specific JavaScript on this route, against
 * the 40KB ceiling in CLAUDE.md section 3, before any of this screen's other
 * three charts were written. That is not a budget a better import can save. So
 * the charts here are Server Components emitting SVG: no client JavaScript at
 * all, legible with scripting off, and drawn in the design tokens rather than
 * restyled out of a default palette. The measurement and the divergence are both
 * recorded in AUTOPILOT-NOTES.md rather than the document being rewritten.
 *
 * There are no tooltips, and there is no gridline clutter — a baseline, one
 * faint half rule, and nothing else. What a tooltip would have said is in the
 * table underneath, which is better than a tooltip on a phone: it is all visible
 * at once, it is set in tabular mono, and it does not need a pointer.
 */

const WIDTH = 340
const HEIGHT = 182
const PLOT_LEFT = 46
const PLOT_RIGHT = 334
const PLOT_TOP = 10
const BASELINE = 148
const LABEL_Y = 164

/** Two bars per month, and a gap between the pairs. */
const BAR_GAP = 2
const MAX_BAR = 12

type MonthChartProps = {
  months: readonly MonthPoint[]
  currency: string
}

export function MonthChart({ months, currency }: MonthChartProps) {
  if (months.length === 0) return null

  const peak = Math.max(
    0,
    ...months.map((point) => Math.max(point.monthly_total, point.all_in_total)),
  )
  const ceiling = axisCeiling(peak)
  const scale = axisScale(ceiling, currency)

  const slot = (PLOT_RIGHT - PLOT_LEFT) / months.length
  const barWidth = Math.min(MAX_BAR, (slot - BAR_GAP * 3) / 2)

  // A negative month — a refund larger than the spend — draws nothing rather
  // than hanging below the baseline. The figure is still printed in the table
  // under the chart, with its minus sign on it.
  const height = (value: number) =>
    ceiling <= 0 ? 0 : (Math.max(value, 0) / ceiling) * (BASELINE - PLOT_TOP)

  return (
    <svg
      viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
      width="100%"
      role="img"
      aria-label={`Monthly and all-in spend for the last ${months.length} months`}
      className="block"
    >
      <line
        x1={PLOT_LEFT}
        y1={(PLOT_TOP + BASELINE) / 2}
        x2={PLOT_RIGHT}
        y2={(PLOT_TOP + BASELINE) / 2}
        stroke="var(--rule)"
        strokeWidth={1}
      />
      <line
        x1={PLOT_LEFT}
        y1={BASELINE}
        x2={PLOT_RIGHT}
        y2={BASELINE}
        stroke="var(--rule-strong)"
        strokeWidth={1}
      />

      {[
        { value: ceiling, y: PLOT_TOP + 3 },
        { value: ceiling / 2, y: (PLOT_TOP + BASELINE) / 2 + 3 },
        { value: 0, y: BASELINE + 3 },
      ].map((tick) => (
        <text
          key={tick.y}
          x={PLOT_LEFT - 6}
          y={tick.y}
          textAnchor="end"
          fill="var(--text-faint)"
          style={{ font: '400 9px var(--font-mono)', fontVariantNumeric: 'tabular-nums' }}
        >
          {axisLabel(Math.round(tick.value), currency, scale)}
        </text>
      ))}

      {months.map((point, index) => {
        const centre = PLOT_LEFT + slot * (index + 0.5)
        const monthlyHeight = height(point.monthly_total)
        const allInHeight = height(point.all_in_total)

        return (
          <g key={point.month}>
            <rect
              x={centre - barWidth - BAR_GAP / 2}
              y={BASELINE - monthlyHeight}
              width={barWidth}
              height={monthlyHeight}
              fill="var(--positive)"
              rx={1}
            />
            <rect
              x={centre + BAR_GAP / 2}
              y={BASELINE - allInHeight}
              width={barWidth}
              height={allInHeight}
              fill="var(--bucket-life)"
              rx={1}
            />
            {/* Month numbers, not names: the mono subset carries digits and no
                letters, and the section heading says which months these are. */}
            <text
              x={centre}
              y={LABEL_Y}
              textAnchor="middle"
              fill="var(--text-faint)"
              style={{ font: '400 9px var(--font-mono)', fontVariantNumeric: 'tabular-nums' }}
            >
              {point.month.slice(5, 7)}
            </text>
          </g>
        )
      })}
    </svg>
  )
}
