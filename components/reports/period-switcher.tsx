import Link from 'next/link'
import type { Route } from 'next'

import { REPORT_PERIODS, REPORT_PERIOD_PARAM, type ReportPeriodKey } from '@/lib/reports/types'

type PeriodSwitcherProps = {
  period: ReportPeriodKey
}

/**
 * Three months, six, or twelve.
 *
 * Links rather than buttons, so the whole reports route stays a Server Component
 * and ships no JavaScript of its own. Changing the period is a navigation: it is
 * in the URL, it is shareable, and it survives a refresh — which is the same
 * reasoning as the view switcher, minus the client state that one needs to write
 * the choice back to the profile.
 */
export function PeriodSwitcher({ period }: PeriodSwitcherProps) {
  return (
    <div role="group" aria-label="How far back" className="panel-sunken flex w-full gap-1 rounded-full p-1">
      {REPORT_PERIODS.map((entry) => {
        const selected = entry.key === period
        return (
          <Link
            key={entry.key}
            href={`/money/reports?${REPORT_PERIOD_PARAM}=${entry.key}` as Route}
            aria-current={selected ? 'page' : undefined}
            scroll={false}
            className={[
              'flex min-h-touch flex-1 items-center justify-center rounded-full border px-3 text-label',
              'transition-colors duration-state ease-enter',
              selected
                ? 'border-border-strong bg-surface font-medium text-ink'
                : 'border-transparent text-ink-muted',
            ].join(' ')}
          >
            {entry.label}
          </Link>
        )
      })}
    </div>
  )
}
