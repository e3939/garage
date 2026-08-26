import { SERVICE_STATE_COLOUR, usedFraction, type ServiceDue } from '@/lib/service/types'

/**
 * How far through a service interval the car is, as a small arc.
 *
 * docs/01-PRODUCT.md, section D: "A due item on the vehicle home shows as a
 * small gauge, not a red banner. Nagging is rude."
 *
 * The shape borrows the budget arc's language from docs/03-DESIGN.md — a
 * tachometer sweep rather than a bar — deliberately, and just as deliberately
 * leaves out the two things that make that one a signature element: it has no
 * tick marks and its needle never sweeps in. There are four signature elements
 * and the doc says not to add a fifth. This is the same gesture, quieter, in a
 * corner.
 *
 * A Server Component drawing an SVG, so the gauge costs no client JavaScript at
 * all. `pathLength` is fixed at 100 so the dash arithmetic is a percentage and
 * does not have to know the radius.
 */

/** 240 degrees, from lower-left round the top to lower-right. */
const START = 150
const SWEEP = 240
const RADIUS = 24
const CX = 32
const CY = 34

function point(angle: number): string {
  const radians = (angle * Math.PI) / 180
  return `${(CX + RADIUS * Math.cos(radians)).toFixed(2)} ${(CY + RADIUS * Math.sin(radians)).toFixed(2)}`
}

const ARC = `M ${point(START)} A ${RADIUS} ${RADIUS} 0 1 1 ${point(START + SWEEP)}`

type DueGaugeProps = {
  due: Pick<ServiceDue, 'remaining_fraction' | 'state'>
  /** Says what the arc means, because a shape on its own is not a label. */
  label: string
  size?: number
}

export function DueGauge({ due, label, size = 64 }: DueGaugeProps) {
  const used = usedFraction(due)

  return (
    <svg
      viewBox="0 0 64 56"
      width={size}
      height={(size * 56) / 64}
      role="img"
      aria-label={label}
      className="shrink-0"
    >
      <path
        d={ARC}
        fill="none"
        stroke="var(--rule)"
        strokeWidth={6}
        strokeLinecap="round"
      />
      <path
        d={ARC}
        fill="none"
        stroke={SERVICE_STATE_COLOUR[due.state]}
        strokeWidth={6}
        strokeLinecap="round"
        pathLength={100}
        strokeDasharray={`${(used * 100).toFixed(2)} 100`}
      />
    </svg>
  )
}
