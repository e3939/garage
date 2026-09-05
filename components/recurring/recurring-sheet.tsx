// A form: a label, an amount, a cadence and a first due date.
'use client'

import { useState } from 'react'

import {
  createRecurringAction,
  deleteRecurringAction,
  updateRecurringAction,
} from '@/app/(app)/recurring/actions'
import { CategoryChips } from '@/components/expenses/category-chips'
import { AmountInput } from '@/components/ui/amount-input'
import { Button } from '@/components/ui/button'
import { Field, INPUT_CLASS } from '@/components/ui/field'
import { useToast } from '@/components/ui/toast'
import { undoFor } from '@/components/ui/undo'
import { resolveBucket, resolveCountsTowardBudget } from '@/lib/budget'
import type { IsoDate } from '@/lib/dates'
import { BUCKET_LABEL, type CategoryOption, type VehicleOption } from '@/lib/expenses/types'
import { formatAmount, parseAmount, parsedAmountHint } from '@/lib/money'
import {
  CADENCES,
  CADENCE_DESCRIPTION,
  CADENCE_LABEL,
  firstDueOnOrAfter,
  type Cadence,
} from '@/lib/recurring/cadence'
import type { RecurringWrite } from '@/lib/recurring/schema'
import type { RecurringTemplate } from '@/lib/recurring/types'

export type RecurringSheetProps = {
  mode: 'create' | 'edit'
  initial?: RecurringTemplate | null
  categories: readonly CategoryOption[]
  vehicles: readonly VehicleOption[]
  currency: string
  locale: string
  today: IsoDate
  onDone: () => void
}

/**
 * A recurring template.
 *
 * It is not an expense and the form says so: there is no photo field, no
 * merchant, no note and no amortisation. What it holds is what the generator
 * needs to write a draft — an amount, where it files, and when it next lands.
 * Everything else about a real expense is added, if it is ever needed, after the
 * draft has been confirmed and become an ordinary row in the ledger.
 *
 * The bucket and the budget switch are resolved from the category by
 * `lib/budget.ts` and stored on the template rather than left null, so the row
 * the cron job writes at three in the morning is the row this screen promised.
 * The sentence under the chips says which way it went.
 *
 * "Next due" is computed from the cadence and the preferred day, and is then
 * editable — a template set up in the middle of the month for a bill that has
 * already been paid should start next month, and only the person entering it
 * knows that.
 */
export function RecurringSheet({
  mode,
  initial,
  categories,
  vehicles,
  currency,
  locale,
  today,
  onDone,
}: RecurringSheetProps) {
  const toast = useToast()
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [label, setLabel] = useState(initial?.label ?? '')
  const [amountText, setAmountText] = useState(
    initial?.amount == null ? '' : formatAmount(initial.amount, currency, { locale }),
  )
  const [categoryId, setCategoryId] = useState(initial?.category_id ?? '')
  const [vehicleId, setVehicleId] = useState(initial?.vehicle_id ?? '')
  const [cadence, setCadence] = useState<Cadence>(initial?.cadence ?? 'monthly')
  const [dayText, setDayText] = useState(
    initial?.day_of_month == null ? '' : String(initial.day_of_month),
  )
  const [nextDue, setNextDue] = useState<IsoDate>(initial?.next_due ?? today)
  const [touchedDue, setTouchedDue] = useState(mode === 'edit')

  const category = categories.find((entry) => entry.id === categoryId) ?? null
  const bucket = resolveBucket({ category, hasVehicle: vehicleId !== '' })
  const counts = resolveCountsTowardBudget({ category, bucket })
  const amount = parseAmount(amountText, currency)

  const dayOfMonth = (() => {
    const trimmed = dayText.trim()
    if (trimmed === '') return null
    const parsed = Number(trimmed)
    return Number.isInteger(parsed) && parsed >= 1 && parsed <= 31 ? parsed : null
  })()

  const monthOfYear = cadence === 'yearly' ? Number(nextDue.slice(5, 7)) : null

  /**
   * The due date follows the cadence until somebody touches it, and then it
   * stops moving. A field that keeps rewriting itself under the cursor is worse
   * than one that never helps at all.
   */
  function recompute(nextCadence: Cadence, nextDay: number | null) {
    if (touchedDue) return
    setNextDue(
      firstDueOnOrAfter({
        cadence: nextCadence,
        from: today,
        dayOfMonth: nextDay,
        monthOfYear: null,
      }),
    )
  }

  async function save() {
    setError(null)

    if (label.trim() === '') {
      setError('Name what this is')
      return
    }
    if (amount === null || amount === 0) {
      setError('Enter an amount')
      return
    }

    const write: RecurringWrite = {
      id: initial?.id ?? crypto.randomUUID(),
      label: label.trim(),
      amount,
      currency,
      category_id: categoryId === '' ? null : categoryId,
      vehicle_id: vehicleId === '' ? null : vehicleId,
      bucket,
      counts_toward_budget: counts,
      cadence,
      day_of_month: dayOfMonth,
      month_of_year: monthOfYear,
      next_due: nextDue,
      active: initial?.active ?? true,
    }

    setSaving(true)
    const result =
      mode === 'create' ? await createRecurringAction(write) : await updateRecurringAction(write)
    setSaving(false)

    if (!result.ok) {
      setError(result.error)
      return
    }

    onDone()
  }

  async function remove() {
    if (!initial) return
    setSaving(true)
    const result = await deleteRecurringAction(initial.id)
    setSaving(false)

    if (!result.ok) {
      setError(result.error)
      return
    }

    onDone()
    toast.show(`${initial.label} deleted`, undoFor(result, toast.show))
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="min-h-0 flex-1 space-y-5 overflow-y-auto overflow-x-hidden px-4 py-4">
        <Field label="What it is" htmlFor="recurring-label" error={error}>
          <input
            id="recurring-label"
            className={INPUT_CLASS}
            autoComplete="off"
            placeholder="Insurance"
            value={label}
            onChange={(event) => setLabel(event.target.value)}
          />
        </Field>

        <Field
          label="Amount"
          htmlFor="recurring-amount"
          hint={
            parsedAmountHint(amountText, currency, locale) ??
            'The draft arrives at this figure and the amount is editable before you confirm it.'
          }
        >
          <AmountInput
            id="recurring-amount"
            placeholder="0"
            currency={currency}
            locale={locale}
            value={amountText}
            onValueChange={setAmountText}
          />
        </Field>

        <div className="space-y-2">
          <p className="text-label text-ink-muted">Category</p>
          <CategoryChips
            categories={categories}
            value={categoryId}
            onChange={setCategoryId}
          />
          <p className="text-caption text-ink-muted">
            {counts ? 'Counts toward the budget' : 'Kept out of the budget'}
            {` · ${BUCKET_LABEL[bucket]}`}
          </p>
        </div>

        {vehicles.length > 0 ? (
          <Field
            label="Car"
            htmlFor="recurring-vehicle"
            hint="Attaching a car moves this into a car bucket."
          >
            <select
              id="recurring-vehicle"
              className={INPUT_CLASS}
              value={vehicleId}
              onChange={(event) => setVehicleId(event.target.value)}
            >
              <option value="">No car</option>
              {vehicles.map((vehicle) => (
                <option key={vehicle.id} value={vehicle.id}>
                  {vehicle.nickname}
                </option>
              ))}
            </select>
          </Field>
        ) : null}

        <div className="space-y-2">
          <p className="text-label text-ink-muted">How often</p>
          <div role="group" aria-label="How often" className="panel-sunken flex w-full gap-1 rounded-full p-1">
            {CADENCES.map((option) => (
              <button
                key={option}
                type="button"
                onClick={() => {
                  setCadence(option)
                  recompute(option, dayOfMonth)
                }}
                aria-pressed={cadence === option}
                className={[
                  'min-h-touch flex-1 rounded-full border px-3 text-label',
                  'transition-colors duration-state ease-enter',
                  cadence === option
                    ? 'border-border-strong bg-surface font-medium text-ink'
                    : 'border-transparent text-ink-muted',
                ].join(' ')}
              >
                {CADENCE_LABEL[option]}
              </button>
            ))}
          </div>
          <p className="text-caption text-ink-muted">{CADENCE_DESCRIPTION[cadence]}</p>
        </div>

        <Field
          label="Day of the month"
          htmlFor="recurring-day"
          hint="Optional. A template due on the 31st lands on the 30th in April and comes back to the 31st in May."
        >
          <input
            id="recurring-day"
            type="number"
            inputMode="numeric"
            min={1}
            max={31}
            placeholder="Same day each time"
            className={`${INPUT_CLASS} font-mono`}
            value={dayText}
            onChange={(event) => {
              setDayText(event.target.value)
              const parsed = Number(event.target.value)
              recompute(
                cadence,
                Number.isInteger(parsed) && parsed >= 1 && parsed <= 31 ? parsed : null,
              )
            }}
          />
        </Field>

        <Field label="Next due" htmlFor="recurring-due" hint="When the first draft appears.">
          <input
            id="recurring-due"
            type="date"
            className={`${INPUT_CLASS} font-mono`}
            value={nextDue}
            onChange={(event) => {
              setTouchedDue(true)
              setNextDue(event.target.value)
            }}
          />
        </Field>

        {mode === 'edit' && initial ? (
          <div className="border-t border-border pt-4">
            <Button variant="danger" className="w-full" onClick={remove} disabled={saving}>
              Delete template
            </Button>
          </div>
        ) : null}
      </div>

      <div
        className="border-t border-border bg-surface px-4 py-3"
        style={{ paddingBottom: 'calc(var(--space-3) + env(safe-area-inset-bottom))' }}
      >
        <Button variant="primary" className="w-full" onClick={save} disabled={saving}>
          {mode === 'create' ? 'Add the template' : 'Save changes'}
        </Button>
      </div>
    </div>
  )
}
