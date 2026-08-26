import type { Route } from 'next'
import Link from 'next/link'

import { Wrench, ICON_UI } from '@/components/icons'
import { DueGauge } from '@/components/service/due-gauge'
import { dueSummary, SERVICE_STATE_LABEL, type ServiceDue } from '@/lib/service/types'

type ServicePanelProps = {
  vehicleId: string
  /** The most urgent live schedule, or null when every one has been deleted. */
  due: ServiceDue | null
  locale: string
}

/**
 * The fourth figure on the vehicle home: next service due.
 *
 * "A due item on the vehicle home shows as a small gauge, not a red banner.
 * Nagging is rude." (docs/01-PRODUCT.md.) So the whole panel is one arc, the
 * item's name, and one line saying how far off it is on the axis that decides
 * it — and it says the same thing in the same place whether the answer is four
 * thousand kilometres or minus two hundred. Only the colour of the arc moves.
 *
 * A new car arrives with seven seeded intervals, so this is empty only when
 * somebody has deliberately deleted all of them.
 */
export function ServicePanel({ vehicleId, due, locale }: ServicePanelProps) {
  return (
    <Link
      href={`/garage/${vehicleId}/service` as Route}
      className="block rounded-md border border-border bg-surface px-4 py-3"
    >
      <p className="text-eyebrow font-display uppercase text-ink-muted">Next service</p>

      {due === null ? (
        <p className="mt-2 flex items-center gap-2 text-ink-faint">
          <Wrench {...ICON_UI} aria-hidden />
          <span className="text-body">Nothing scheduled</span>
        </p>
      ) : (
        <div className="mt-2 flex items-center gap-4">
          <DueGauge due={due} label={`${due.name}: ${SERVICE_STATE_LABEL[due.state]}`} />
          <div className="min-w-0 flex-1">
            <p className="truncate text-title text-ink">{due.name}</p>
            <p className="text-caption text-ink-muted">{dueSummary(due, locale)}</p>
            {due.basis === 'purchase' ? (
              <p className="text-caption text-ink-faint">Estimated from purchase</p>
            ) : null}
          </div>
        </div>
      )}

      <p className="mt-2 text-caption text-ink-muted">
        {due === null
          ? 'The schedule is empty. Add an item to start tracking intervals.'
          : 'Open the schedule to mark it done or change the interval.'}
      </p>
    </Link>
  )
}
