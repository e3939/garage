// A switch, an amount field that parses as you type, and category chips.
'use client'

import { CategoryChips } from '@/components/expenses/category-chips'
import { AmountInput } from '@/components/ui/amount-input'
import { Field } from '@/components/ui/field'
import { resolveBucket, resolveCountsTowardBudget } from '@/lib/budget'
import { monthName } from '@/lib/dates-display'
import type { IsoDate } from '@/lib/dates'
import { BUCKET_LABEL, type CategoryOption } from '@/lib/expenses/types'
import { parseAmount, parsedAmountHint } from '@/lib/money'

export type LinkedExpenseFieldProps = {
  /** Whether the expense will be written at all. */
  enabled: boolean
  onEnabled: (next: boolean) => void
  amountText: string
  onAmountText: (next: string) => void
  categoryId: string
  onCategoryId: (next: string) => void
  categories: readonly CategoryOption[]
  currency: string
  locale: string
  /** The expense's own date, which is the record's date, not today's. */
  occurredOn: IsoDate
  /** What the switch says. "Log the expense too", "Log this fill-up as spend". */
  label: string
  /** Set when the amount is not editable here — the fuel form owns its own. */
  amountReadOnly?: boolean
}

/**
 * The expense that travels with a service record, a fill-up or a part.
 *
 * One switch, one amount, one row of chips, and one line of plain language
 * saying where the money lands — the same sentence the expense form's impact
 * control uses, because it is the same decision. Everything else an expense can
 * carry is left to the ledger: this is a sidecar, not a second expense form.
 */
export function LinkedExpenseField({
  enabled,
  onEnabled,
  amountText,
  onAmountText,
  categoryId,
  onCategoryId,
  categories,
  currency,
  locale,
  occurredOn,
  label,
  amountReadOnly = false,
}: LinkedExpenseFieldProps) {
  const category = categories.find((entry) => entry.id === categoryId) ?? null
  const bucket = resolveBucket({ category, hasVehicle: true })
  const counts = resolveCountsTowardBudget({ category, bucket })
  const amount = parseAmount(amountText, currency)

  return (
    <div className="space-y-3 rounded-md border border-border bg-surface-sunken p-3">
      <button
        type="button"
        role="switch"
        aria-checked={enabled}
        onClick={() => onEnabled(!enabled)}
        className="flex min-h-touch w-full items-center justify-between gap-4 text-left"
      >
        <span className="text-body text-ink">{label}</span>
        <span
          aria-hidden
          className="relative inline-flex h-6 w-12 shrink-0 rounded-full border transition-colors duration-state ease-enter"
          style={{
            backgroundColor: enabled ? 'var(--positive)' : 'var(--surface)',
            borderColor: enabled ? 'var(--positive)' : 'var(--border-strong)',
          }}
        >
          <span
            className="absolute top-px size-5 rounded-full bg-surface transition-[left] duration-state ease-enter"
            style={{ left: enabled ? 'calc(100% - 21px)' : '1px' }}
          />
        </span>
      </button>

      {enabled ? (
        <>
          {amountReadOnly ? null : (
            <Field
              label="Cost"
              htmlFor="linked-amount"
              hint={parsedAmountHint(amountText, currency, locale) ?? 'Type 150k or 1.2m if that is quicker.'}
            >
              <AmountInput
                id="linked-amount"
                placeholder="0"
                currency={currency}
                locale={locale}
                value={amountText}
                onValueChange={onAmountText}
              />
            </Field>
          )}

          <div className="space-y-2">
            <p className="text-label text-ink-muted">Category</p>
            <CategoryChips
              categories={categories}
              value={categoryId}
              onChange={onCategoryId}
            />
            <p className="text-caption text-ink-muted">
              {`${BUCKET_LABEL[bucket]} spend. `}
              {counts ? `Counts toward ${monthName(occurredOn)}.` : `Kept out of ${monthName(occurredOn)}.`}
              {amount === null && !amountReadOnly ? ' Nothing is written without an amount.' : ''}
            </p>
          </div>
        </>
      ) : (
        <p className="text-caption text-ink-muted">
          Nothing goes to the ledger. The record is kept either way.
        </p>
      )}
    </div>
  )
}
