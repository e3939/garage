// Form state.
'use client'

import { Field, INPUT_CLASS } from '@/components/ui/field'
import { addMonthsToMonthStart, monthLabel, type IsoDate } from '@/lib/dates'
import { formatMoney, splitMinor } from '@/lib/money'

/**
 * The spans a cost actually gets spread over. One control, not a number field
 * and a row of chips doing the same job: on a phone the list is one tap and the
 * platform picker, and nothing in it needs typing.
 */
const CHOICES = [1, 2, 3, 6, 9, 12, 18, 24, 36, 48, 60] as const

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

function monthChoices(months: number): number[] {
  const choices: number[] = [...CHOICES]
  // An expense stored with a span the list does not offer — anything up to the
  // schema's 120 — keeps its own value rather than being quietly rounded to a
  // neighbour the moment its form opens.
  if (!choices.includes(months)) {
    choices.push(months)
    choices.sort((a, b) => a - b)
  }
  return choices
}

/**
 * "Spread over ___."
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

  const hint = !spread
    ? 'The whole amount lands in the month it happened.'
    : first === undefined || rest === undefined
      ? `Split across ${months} months, ending ${monthLabel(lastMonth)}.`
      : first === rest
        ? `${formatMoney(first, currency, { locale })} a month until ${monthLabel(lastMonth)}.`
        : `${formatMoney(first, currency, { locale })} in the first month, then ${formatMoney(rest, currency, { locale })} until ${monthLabel(lastMonth)}.`

  return (
    <div className="space-y-2">
      {suggested ? (
        <p className="text-caption text-ink-muted">
          This is a lot larger than your usual expense. Spread it if it is not really a
          one-month cost.
        </p>
      ) : null}

      <Field label="Spread over" htmlFor="amortize-months" hint={hint}>
        <select
          id="amortize-months"
          className={INPUT_CLASS}
          value={months}
          onChange={(event) => onChange(Number(event.target.value))}
        >
          {monthChoices(months).map((choice) => (
            <option key={choice} value={choice}>
              {choice === 1 ? 'Do not spread' : `${choice} months`}
            </option>
          ))}
        </select>
      </Field>
    </div>
  )
}
