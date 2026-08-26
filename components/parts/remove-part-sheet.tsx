// Three buttons and one conditional amount field.
'use client'

import { useState } from 'react'

import { removePartAction } from '@/app/(app)/parts/actions'
import { Button } from '@/components/ui/button'
import { Chip } from '@/components/ui/chip'
import { Field, INPUT_CLASS } from '@/components/ui/field'
import { Money } from '@/components/ui/money'
import type { IsoDate } from '@/lib/dates'
import { formatMoney, parseAmount, parsedAmountHint } from '@/lib/money'
import { REMOVAL_LABEL, REMOVAL_OUTCOMES, netCost, type Part, type RemovalOutcome } from '@/lib/parts/types'

export type RemovePartSheetProps = {
  part: Part
  currency: string
  locale: string
  today: IsoDate
  onDone: () => void
}

/**
 * Taking a part off the car.
 *
 * docs/01-PRODUCT.md, section F: "Removing a part from the car prompts: keep,
 * sell, or bin. Selling records a negative expense so the true cost of a mod
 * nets out correctly."
 *
 * The three outcomes are three chips rather than three buttons at the bottom,
 * because the amount field only exists for one of them and a layout that grows a
 * field under a button you have already pressed is a layout that gets pressed
 * twice. Pick the outcome, then confirm.
 *
 * The sale amount is typed as a positive number — that is what the buyer handed
 * over — and the minus is applied on the server, where it cannot be argued with.
 * The line underneath says what the part will have cost once it is gone, which
 * is the number the whole feature exists to produce.
 */
export function RemovePartSheet({ part, currency, locale, today, onDone }: RemovePartSheetProps) {
  const [outcome, setOutcome] = useState<RemovalOutcome>('shelf')
  const [removedOn, setRemovedOn] = useState<string>(today)
  const [amountText, setAmountText] = useState('')
  const [note, setNote] = useState('')
  const [formError, setFormError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  const sale = parseAmount(amountText, currency)
  const paid = part.cost
  const netAfter =
    outcome === 'sold' && sale !== null
      ? netCost({ cost: paid, sale: -sale })
      : netCost({ cost: paid, sale: part.sale })

  async function confirm() {
    setFormError(null)

    if (outcome === 'sold' && (sale === null || sale <= 0)) {
      setFormError('What did it sell for?')
      return
    }

    setSaving(true)
    const result = await removePartAction({
      id: part.id,
      outcome,
      removed_on: removedOn,
      sale_amount: outcome === 'sold' ? sale : null,
      sale_note: note.trim() === '' ? null : note.trim(),
    })
    setSaving(false)

    if (!result.ok) {
      setFormError(result.error)
      return
    }

    onDone()
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="min-h-0 flex-1 space-y-5 overflow-y-auto px-4 py-4">
        <div className="space-y-2">
          <p className="text-label text-ink-muted">What happens to it</p>
          <div className="flex flex-wrap gap-2">
            {REMOVAL_OUTCOMES.map((entry) => (
              <Chip key={entry} selected={outcome === entry} onSelect={() => setOutcome(entry)}>
                {REMOVAL_LABEL[entry]}
              </Chip>
            ))}
          </div>
          <p className="text-caption text-ink-muted">
            {outcome === 'shelf'
              ? 'It moves to the shelf and stays in the inventory. Nothing goes to the ledger.'
              : outcome === 'sold'
                ? 'A negative expense is written against the same mod, so what the part really cost comes out right.'
                : 'It leaves the inventory as gone. Nothing comes back.'}
          </p>
        </div>

        <Field label="Off the car on" htmlFor="removal-date">
          <input
            id="removal-date"
            type="date"
            className={`${INPUT_CLASS} font-mono`}
            value={removedOn}
            onChange={(event) => setRemovedOn(event.target.value)}
          />
        </Field>

        {outcome === 'sold' ? (
          <>
            <Field
              label="Sold for"
              htmlFor="removal-amount"
              hint={parsedAmountHint(amountText, currency, locale) ?? 'Type 150k or 1.2m if that is quicker.'}
              error={formError}
            >
              <input
                id="removal-amount"
                inputMode="decimal"
                autoComplete="off"
                placeholder="0"
                className={`${INPUT_CLASS} font-mono text-odometer`}
                value={amountText}
                onChange={(event) => setAmountText(event.target.value)}
              />
            </Field>

            <Field label="Sold to" htmlFor="removal-note" hint="Goes on the ledger row as the merchant.">
              <input
                id="removal-note"
                className={INPUT_CLASS}
                autoComplete="off"
                value={note}
                onChange={(event) => setNote(event.target.value)}
              />
            </Field>
          </>
        ) : formError ? (
          <p className="text-caption text-critical">{formError}</p>
        ) : null}

        <dl className="space-y-1 rounded-md border border-border bg-surface-sunken p-3">
          <div className="flex items-baseline justify-between gap-4">
            <dt className="text-caption text-ink-muted">Paid</dt>
            <dd>
              {paid === null ? (
                <span className="font-mono text-label text-ink-faint">&mdash;</span>
              ) : (
                <Money amount={paid} currency={part.currency ?? currency} locale={locale} size="label" />
              )}
            </dd>
          </div>
          <div className="flex items-baseline justify-between gap-4">
            <dt className="text-caption text-ink-muted">
              {outcome === 'sold' ? 'Net once sold' : 'Net cost'}
            </dt>
            <dd>
              {netAfter === null ? (
                <span className="font-mono text-label text-ink-faint">&mdash;</span>
              ) : (
                <Money amount={netAfter} currency={part.currency ?? currency} locale={locale} />
              )}
            </dd>
          </div>
          {part.mod_title && outcome === 'sold' ? (
            <p className="pt-1 text-caption text-ink-muted">
              {`${formatMoney(sale ?? 0, currency, { locale })} comes off ${part.mod_title}.`}
            </p>
          ) : null}
        </dl>
      </div>

      <div
        className="border-t border-border bg-surface px-4 py-3"
        style={{ paddingBottom: 'calc(var(--space-3) + env(safe-area-inset-bottom))' }}
      >
        <Button variant="primary" className="w-full" onClick={confirm} disabled={saving}>
          {outcome === 'shelf' ? 'Move to the shelf' : outcome === 'sold' ? 'Record the sale' : 'Bin it'}
        </Button>
      </div>
    </div>
  )
}
