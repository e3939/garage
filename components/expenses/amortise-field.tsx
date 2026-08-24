// Form state.
'use client'

import { Chip } from '@/components/ui/chip'
import { addMonthsToMonthStart, monthLabel, type IsoDate } from '@/lib/dates'
import { formatMoney, splitMinor } from '@/lib/money'

/** The spans people actually use. Anything else is typed. */
const PRESETS = [3, 6, 12, 24] as const

type AmortiseFieldProps = {
  months: number
  onChange: (months: number) => void
  /** Minor units, or null while the amount field is empty or unreadable. */
  amount: number | null
  currency: string
  locale: string
  occurredOn: IsoDate
  /** Suggestion mode adds the one-line explanation of why it appeared. */
  suggested?: boolean
}

/**
 * "Spread this over ___ months."
 *
 * Never preselected: the field arrives at one month and stays there until
 * someone chooses otherwise (docs/01-PRODUCT.md). The line underneath states
 * exactly what will land in each month, using the same integer split the
 * database uses, so the remainder rule is visible rather than surprising.
 */
export function AmortiseField({
  months,
  onChange,
  amount,
  currency,
  locale,
  occurredOn,
  suggested = false,
}: AmortiseFieldProps) {
  const spread = months > 1
  const slices = spread && amount !== null ? splitMinor(amount, months) : null
  const first = slices?.[0]
  const rest = slices?.[1]
  const lastMonth = addMonthsToMonthStart(occurredOn, months - 1)

  return (
    <div className="space-y-2">
      {suggested ? (
        <p className="text-caption text-ink-muted">
          This is a lot larger than your usual expense. Spread it if it is not really a
          one-month cost.
        </p>
      ) : null}

      <div className="flex flex-wrap items-center gap-2">
        <span className="text-label text-ink-muted">Spread this over</span>
        <label className="sr-only" htmlFor="amortize-months">
          Months to spread over
        </label>
        <input
          id="amortize-months"
          type="number"
          inputMode="numeric"
          min={1}
          max={120}
          value={months}
          onChange={(event) => {
            const next = Number(event.target.value)
            onChange(Number.isFinite(next) ? Math.min(120, Math.max(1, Math.trunc(next))) : 1)
          }}
          className="min-h-touch w-20 rounded-md border border-border-strong bg-surface px-3 text-center font-mono text-body text-ink outline-none"
        />
        <span className="text-label text-ink-muted">months</span>
      </div>

      <div className="flex flex-wrap gap-2">
        {PRESETS.map((preset) => (
          <Chip key={preset} selected={months === preset} onSelect={() => onChange(preset)}>
            {preset}
          </Chip>
        ))}
        <Chip selected={months === 1} onSelect={() => onChange(1)}>
          Do not spread
        </Chip>
      </div>

      <p className="text-caption text-ink-muted">
        {!spread
          ? 'The whole amount lands in the month it happened.'
          : first === undefined || rest === undefined
            ? `Split across ${months} months, ending ${monthLabel(lastMonth)}.`
            : first === rest
              ? `${formatMoney(first, currency, { locale })} a month until ${monthLabel(lastMonth)}.`
              : `${formatMoney(first, currency, { locale })} in the first month, then ${formatMoney(rest, currency, { locale })} until ${monthLabel(lastMonth)}.`}
      </p>
    </div>
  )
}
