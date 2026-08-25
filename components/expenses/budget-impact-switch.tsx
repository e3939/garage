// A real switch with real state.
'use client'

import { monthName } from '@/lib/dates-display'
import type { IsoDate } from '@/lib/dates'

type BudgetImpactSwitchProps = {
  checked: boolean
  onChange: (counts: boolean) => void
  /** The expense's own date. The month named is its month, never today's. */
  occurredOn: IsoDate
}

/**
 * "Counts toward August" / "Kept out of August".
 *
 * The month is taken from the expense, not from the calendar, because the whole
 * point of the switch is to say what this expense does to a particular month —
 * and the expense being edited in September may well have happened in August.
 */
export function BudgetImpactSwitch({ checked, onChange, occurredOn }: BudgetImpactSwitchProps) {
  const month = monthName(occurredOn)

  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className="flex w-full min-h-touch items-center justify-between gap-4 rounded-md border border-border-strong bg-surface px-3 py-2 text-left"
    >
      <span className="text-body text-ink">
        {checked ? `Counts toward ${month}` : `Kept out of ${month}`}
      </span>
      <span
        aria-hidden
        className="relative inline-flex h-6 w-12 shrink-0 rounded-full border transition-colors duration-state ease-enter"
        style={{
          backgroundColor: checked ? 'var(--positive)' : 'var(--surface-sunken)',
          borderColor: checked ? 'var(--positive)' : 'var(--border-strong)',
        }}
      >
        <span
          className="absolute top-px size-5 rounded-full bg-surface transition-[left] duration-state ease-enter"
          style={{ left: checked ? 'calc(100% - 21px)' : '1px' }}
        />
      </span>
    </button>
  )
}
