import type { ConsumptionInterval } from '@/lib/fuel/consumption'
import type { ModMarker } from '@/lib/fuel/types'

/**
 * Consumption over time, as a sparkline with mod markers on it.
 *
 * docs/01-PRODUCT.md, section E: "a sparkline of consumption over time", and "a
 * meaningful consumption change after a mod is annotated on the chart
 * automatically: 'Intake installed' marker on the date."
 *
 * **Why this is an SVG and not Recharts.** CLAUDE.md section 2 names Recharts as
 * the charting library, and it is the right answer for the reports in Phase 7 —
 * axes, tooltips, a legend, several series. This is a sparkline: one polyline,
 * a few rules and some vertical marks, on a screen whose route budget is 40KB
 * gzipped. Recharts is several times that on its own, and it would have to run
 * in the browser to draw a picture that never changes after it is drawn. So the
 * whole thing is a Server Component emitting SVG, costs no client JavaScript at
 * all, and is legible with scripting off. See AUTOPILOT-NOTES.md — the divergence
 * is recorded rather than the document rewritten.
 *
 * The y-axis does not start at zero, and that is deliberate: nobody's car does
 * 0 L/100km, and a chart anchored at zero flattens the four-tenths of a litre
 * that is the entire point of watching this number. The floor and ceiling are
 * padded around the data and both are printed, so the scale is stated rather
 * than implied.
 */

const WIDTH = 320
const HEIGHT = 96
const PAD_X = 4
const PAD_Y = 8

type ConsumptionChartProps = {
  intervals: readonly ConsumptionInterval[]
  markers: readonly ModMarker[]
  /** Dates in words, formatted by the caller. See `lib/dates-display.ts`. */
  dateLabels: Record<string, string>
}

export function ConsumptionChart({ intervals, markers, dateLabels }: ConsumptionChartProps) {
  if (intervals.length < 2) return null

  const values = intervals.map((interval) => interval.l_per_100km)
  const low = Math.min(...values)
  const high = Math.max(...values)
  // A flat log would otherwise divide by zero and draw a line through nothing.
  const span = high - low || 1
  const floor = low - span * 0.15
  const ceiling = high + span * 0.15

  const x = (index: number) =>
    PAD_X + (index * (WIDTH - PAD_X * 2)) / Math.max(1, intervals.length - 1)
  const y = (value: number) =>
    PAD_Y + ((ceiling - value) / (ceiling - floor)) * (HEIGHT - PAD_Y * 2)

  const line = intervals.map((interval, index) => `${x(index).toFixed(1)},${y(interval.l_per_100km).toFixed(1)}`)

  const first = intervals[0]
  const last = intervals[intervals.length - 1]

  /**
   * A marker sits on the first interval that *ended* on or after the day the mod
   * went on, because that is the first tank whose consumption the mod could have
   * affected. A mod installed after the last fill-up has nothing to sit on yet
   * and is left off rather than pinned to the end.
   */
  const placed = markers
    .map((marker) => {
      const index = intervals.findIndex((interval) => interval.ended_on >= marker.installed_on)
      return index === -1 ? null : { marker, index }
    })
    .filter((entry): entry is { marker: ModMarker; index: number } => entry !== null)

  return (
    <figure className="space-y-2">
      <svg
        viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
        className="w-full"
        role="img"
        aria-label={`Consumption across ${intervals.length} full tanks, from ${first?.l_per_100km} to ${last?.l_per_100km} litres per 100 kilometres`}
        preserveAspectRatio="none"
      >
        {placed.map(({ marker, index }) => (
          <line
            key={marker.id}
            x1={x(index)}
            x2={x(index)}
            y1={PAD_Y / 2}
            y2={HEIGHT - PAD_Y / 2}
            stroke="var(--accent)"
            strokeWidth={1}
            strokeDasharray="3 3"
            vectorEffect="non-scaling-stroke"
          />
        ))}

        <polyline
          points={line.join(' ')}
          fill="none"
          stroke="var(--positive)"
          strokeWidth={2}
          strokeLinejoin="round"
          strokeLinecap="round"
          vectorEffect="non-scaling-stroke"
        />

        {intervals.map((interval, index) => (
          <circle
            key={interval.end_fuel_log_id}
            cx={x(index)}
            cy={y(interval.l_per_100km)}
            r={2}
            fill="var(--positive)"
          />
        ))}
      </svg>

      <div className="flex items-baseline justify-between gap-4 text-caption text-ink-faint">
        <span className="font-mono">{`${round1(floor)} – ${round1(ceiling)} L/100km`}</span>
        <span>
          {`${dateLabels[first?.ended_on ?? ''] ?? first?.ended_on} to ${dateLabels[last?.ended_on ?? ''] ?? last?.ended_on}`}
        </span>
      </div>

      {placed.length > 0 ? (
        <figcaption className="text-caption text-ink-muted">
          {`Marked: ${placed.map(({ marker }) => `${marker.title}, ${dateLabels[marker.installed_on] ?? marker.installed_on}`).join(' · ')}`}
        </figcaption>
      ) : null}
    </figure>
  )
}

function round1(value: number): number {
  return Math.round(value * 10) / 10
}
