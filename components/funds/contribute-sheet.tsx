// An amount, a date, a direction, and a note.
'use client'

import { useState } from 'react'

import { logContributionAction } from '@/app/(app)/funds/actions'
import { AmountInput } from '@/components/ui/amount-input'
import { Button } from '@/components/ui/button'
import { Field, INPUT_CLASS } from '@/components/ui/field'
import { Money } from '@/components/ui/money'
import type { IsoDate } from '@/lib/dates'
import type { FundStatus } from '@/lib/funds/types'
import { parseAmount, parsedAmountHint } from '@/lib/money'

export type ContributeSheetProps = {
  fund: FundStatus
  locale: string
  today: IsoDate
  onDone: () => void
}

/**
 * Money into a fund, or out of it.
 *
 * One form for both directions, because they are one row in one table: a fund's
 * balance is the sum of its contributions and a drawdown is a negative one
 * (docs/02-DATA-MODEL.md). A second form would have been a second code path that
 * could disagree with the first about what a balance is.
 *
 * The direction is a pair of buttons rather than a minus sign somebody has to
 * remember to type, and the line underneath says what the balance will be
 * afterwards — which is the only number anybody is actually checking.
 */
export function ContributeSheet({ fund, locale, today, onDone }: ContributeSheetProps) {
  const [amountText, setAmountText] = useState('')
  const [occurredOn, setOccurredOn] = useState<IsoDate>(today)
  const [note, setNote] = useState('')
  const [drawdown, setDrawdown] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const typed = parseAmount(amountText, fund.currency)
  const magnitude = typed === null ? null : Math.abs(typed)
  const signed = magnitude === null ? null : drawdown ? -magnitude : magnitude
  const after = signed === null ? fund.balance : fund.balance + signed

  async function save() {
    setError(null)

    if (signed === null || signed === 0) {
      setError('Enter an amount')
      return
    }

    setSaving(true)
    const result = await logContributionAction({
      id: crypto.randomUUID(),
      fund_id: fund.fund_id,
      occurred_on: occurredOn,
      amount: signed,
      note: note.trim(),
    })
    setSaving(false)

    if (!result.ok) {
      setError(result.error)
      return
    }

    onDone()
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="min-h-0 flex-1 space-y-5 overflow-y-auto overflow-x-hidden px-4 py-4">
        <div role="group" aria-label="Direction" className="panel-sunken flex w-full gap-1 rounded-full p-1">
          {[
            { key: false, label: 'Put in' },
            { key: true, label: 'Take out' },
          ].map((option) => (
            <button
              key={String(option.key)}
              type="button"
              onClick={() => setDrawdown(option.key)}
              aria-pressed={drawdown === option.key}
              className={[
                'min-h-touch flex-1 rounded-full border px-3 text-label',
                'transition-colors duration-state ease-enter',
                drawdown === option.key
                  ? 'border-border-strong bg-surface font-medium text-ink'
                  : 'border-transparent text-ink-muted',
              ].join(' ')}
            >
              {option.label}
            </button>
          ))}
        </div>

        <Field
          label="Amount"
          htmlFor="contribution-amount"
          hint={parsedAmountHint(amountText, fund.currency, locale) ?? 'What moved.'}
          error={error}
        >
          <AmountInput
            id="contribution-amount"
            autoFocus
            placeholder="0"
            className={`${INPUT_CLASS} font-mono text-odometer-lg`}
            currency={fund.currency}
            locale={locale}
            value={amountText}
            onValueChange={setAmountText}
          />
        </Field>

        <p className="rounded-md border border-border bg-surface-sunken p-3 text-caption text-ink-muted">
          {'Balance afterwards: '}
          <Money
            amount={after}
            currency={fund.currency}
            locale={locale}
            size="label"
            className={after < 0 ? 'text-critical' : 'text-ink'}
          />
          {after < 0 ? ' — more than the fund holds.' : null}
        </p>

        <Field label="When" htmlFor="contribution-date">
          <input
            id="contribution-date"
            type="date"
            className={`${INPUT_CLASS} font-mono`}
            value={occurredOn}
            onChange={(event) => setOccurredOn(event.target.value)}
          />
        </Field>

        <Field label="Note" htmlFor="contribution-note">
          <input
            id="contribution-note"
            className={INPUT_CLASS}
            autoComplete="off"
            placeholder="Optional"
            value={note}
            onChange={(event) => setNote(event.target.value)}
          />
        </Field>
      </div>

      <div
        className="border-t border-border bg-surface px-4 py-3"
        style={{ paddingBottom: 'calc(var(--space-3) + env(safe-area-inset-bottom))' }}
      >
        <Button variant="primary" className="w-full" onClick={save} disabled={saving}>
          {drawdown ? 'Take it out' : 'Put it in'}
        </Button>
      </div>
    </div>
  )
}
