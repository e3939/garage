import { Money } from '@/components/ui/money'
import { BUCKET_LABEL, BUCKET_VAR, type ExpenseBucket } from '@/lib/expenses/types'
import { lifeCarSplit, type BucketReportRow } from '@/lib/reports/types'

type SplitBarProps = {
  buckets: readonly BucketReportRow[]
  currency: string
  locale: string
}

/**
 * Life against car, and inside the car half, running against project.
 *
 * One stacked rule rather than a pie: the three segments are already the app's
 * core vocabulary and they already have colours everywhere else in it
 * (docs/03-DESIGN.md), so the only job here is to lay them end to end in
 * proportion. A pie would have added an angle nobody can compare by eye and a
 * legend to explain it.
 *
 * All-in figures, at full amount on the day each was paid. This is the
 * cost-of-ownership question — how much of my money is the car — and
 * amortisation is a budget device, not a fact about where the money went.
 */
export function SplitBar({ buckets, currency, locale }: SplitBarProps) {
  const split = lifeCarSplit(buckets)
  const total = split.life.all_in_total + split.car.all_in_total

  if (total <= 0) {
    return (
      <p className="rounded-md border border-border bg-surface p-4 text-body text-ink-muted">
        Nothing spent in this period yet.
      </p>
    )
  }

  const segments: { bucket: ExpenseBucket; amount: number }[] = [
    { bucket: 'life', amount: split.life.all_in_total },
    { bucket: 'car_running', amount: split.running.all_in_total },
    { bucket: 'car_project', amount: split.project.all_in_total },
  ]

  const carShare = Math.round((split.car.all_in_total / total) * 100)

  return (
    <div className="space-y-3 rounded-md border border-border bg-surface p-4">
      <div
        className="flex h-3 w-full overflow-hidden rounded-full bg-surface-sunken"
        role="img"
        aria-label={`${carShare} per cent of this period's spend is the car`}
      >
        {segments.map((segment) => {
          const width = (Math.max(segment.amount, 0) / total) * 100
          if (width <= 0) return null
          return (
            <span
              key={segment.bucket}
              style={{
                width: `${width.toFixed(2)}%`,
                backgroundColor: BUCKET_VAR[segment.bucket],
              }}
            />
          )
        })}
      </div>

      <p className="text-body text-ink">
        {`The car is ${carShare} per cent of what you spent.`}
      </p>

      <dl className="space-y-1">
        {segments.map((segment) => (
          <div key={segment.bucket} className="flex items-baseline justify-between gap-3">
            <dt className="flex min-w-0 items-center gap-2">
              <span
                aria-hidden
                className="size-2 shrink-0 rounded-full"
                style={{ backgroundColor: BUCKET_VAR[segment.bucket] }}
              />
              <span className="truncate text-caption text-ink-muted">
                {BUCKET_LABEL[segment.bucket]}
              </span>
            </dt>
            <dd className="shrink-0">
              <Money amount={segment.amount} currency={currency} locale={locale} size="odometer" />
            </dd>
          </div>
        ))}
      </dl>
    </div>
  )
}
