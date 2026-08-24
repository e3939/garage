// The form is entirely interactive: parsing as you type, resolving the bucket,
// and handing the write to the optimistic queue.
'use client'

import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { useForm } from 'react-hook-form'

import {
  createExpenseAction,
  updateExpenseAction,
  type ActionResult,
} from '@/app/(app)/expenses/actions'
import { AmortiseField } from '@/components/expenses/amortise-field'
import { BucketChips } from '@/components/expenses/bucket-chips'
import { BudgetImpactSwitch } from '@/components/expenses/budget-impact-switch'
import { CategoryChips } from '@/components/expenses/category-chips'
import { useExpenseStore } from '@/components/expenses/expense-store'
import { Button } from '@/components/ui/button'
import { Field, INPUT_CLASS } from '@/components/ui/field'
import { resolveBucket, resolveCountsTowardBudget } from '@/lib/budget'
import { isIsoDate, type IsoDate } from '@/lib/dates'
import type { ExpenseWrite } from '@/lib/expenses/schema'
import { draftLedgerRow } from '@/lib/expenses/optimistic'
import type { CategoryOption, ExpenseBucket, LedgerRow, VehicleOption } from '@/lib/expenses/types'
import { formatAmount, parseAmount, parsedAmountHint } from '@/lib/money'

export type ExpenseFormProps = {
  mode: 'create' | 'edit'
  initial?: LedgerRow | null
  categories: readonly CategoryOption[]
  /** Category icons, drawn by a Server Component so Phosphor stays off the wire. */
  icons: Record<string, ReactNode>
  vehicles: readonly VehicleOption[]
  currency: string
  locale: string
  /** Above this the form offers to spread the cost. Null means never offer. */
  amortiseThreshold: number | null
  today: IsoDate
  onDone: () => void
}

type Values = {
  amountText: string
  categoryId: string
  occurredOn: string
  vehicleId: string
  merchant: string
  note: string
  /** Empty string means "whatever the category and the vehicle imply". */
  bucketOverride: '' | ExpenseBucket
  countsOverride: '' | 'yes' | 'no'
  amortizeMonths: number
  odometerKm: string
}

function defaults(
  initial: LedgerRow | null | undefined,
  categories: readonly CategoryOption[],
  today: IsoDate,
  locale: string,
): Values {
  if (!initial) {
    return {
      amountText: '',
      categoryId: '',
      occurredOn: today,
      vehicleId: '',
      merchant: '',
      note: '',
      bucketOverride: '',
      countsOverride: '',
      amortizeMonths: 1,
      odometerKm: '',
    }
  }

  // An edit starts from what is stored, but only records an override where the
  // stored value actually differs from what the category would have produced —
  // so changing the category on an untouched expense still moves its bucket.
  const category = categories.find((entry) => entry.id === initial.category_id) ?? null
  const bucketMatchesCategory = category?.default_bucket === initial.bucket
  const countsMatchesCategory =
    category?.default_counts_toward_budget === initial.counts_toward_budget

  return {
    // Back into the field the way it would have been typed, so a USD 123.45
    // does not reappear as twelve thousand.
    amountText: formatAmount(initial.amount, initial.currency, { locale }),
    categoryId: initial.category_id ?? '',
    occurredOn: initial.occurred_on,
    vehicleId: initial.vehicle_id ?? '',
    merchant: initial.merchant ?? '',
    note: initial.note ?? '',
    bucketOverride: bucketMatchesCategory ? '' : initial.bucket,
    countsOverride: countsMatchesCategory ? '' : initial.counts_toward_budget ? 'yes' : 'no',
    amortizeMonths: initial.amortize_months,
    odometerKm: initial.odometer_km === null ? '' : String(initial.odometer_km),
  }
}

export function ExpenseForm({
  mode,
  initial,
  categories,
  icons,
  vehicles,
  currency,
  locale,
  amortiseThreshold,
  today,
  onDone,
}: ExpenseFormProps) {
  const store = useExpenseStore()
  const [formError, setFormError] = useState<string | null>(null)

  const { register, handleSubmit, watch, setValue, formState } = useForm<Values>({
    defaultValues: defaults(initial, categories, today, locale),
  })

  const values = watch()

  const amountRef = useRef<HTMLInputElement | null>(null)
  const amountField = register('amountText')

  // The sheet opens with the amount field focused and a numeric keypad up. The
  // frame of delay lets <dialog>.showModal() finish claiming focus first.
  useEffect(() => {
    const frame = requestAnimationFrame(() => amountRef.current?.focus())
    return () => cancelAnimationFrame(frame)
  }, [])

  // A half-cleared date input reads as an empty string; the copy underneath the
  // switch still has to name a month, so it falls back to today until it is real.
  const occurredOn = isIsoDate(values.occurredOn) ? values.occurredOn : today

  const amount = parseAmount(values.amountText, currency)
  const hint = parsedAmountHint(values.amountText, currency, locale)

  const category = useMemo(
    () => categories.find((entry) => entry.id === values.categoryId) ?? null,
    [categories, values.categoryId],
  )
  const vehicle = useMemo(
    () => vehicles.find((entry) => entry.id === values.vehicleId) ?? null,
    [vehicles, values.vehicleId],
  )

  const bucket = resolveBucket({
    override: values.bucketOverride || null,
    category,
    hasVehicle: vehicle !== null,
  })

  // When the bucket has been moved away from the category's own, the category's
  // budget default no longer describes this expense, so the per-bucket policy
  // takes over instead. Anything the switch says still wins over both.
  const categoryGovernsBudget = category !== null && category.default_bucket === bucket
  const countsTowardBudget = resolveCountsTowardBudget({
    override: values.countsOverride === '' ? null : values.countsOverride === 'yes',
    category: categoryGovernsBudget ? category : null,
    bucket,
  })

  const forcedToLife =
    category !== null && category.default_bucket !== 'life' && bucket === 'life' && vehicle === null

  const suggestSpread =
    amortiseThreshold !== null && amount !== null && Math.abs(amount) > amortiseThreshold

  function chooseBucket(next: ExpenseBucket) {
    setValue('bucketOverride', next)
    if (next === 'life') {
      setValue('vehicleId', '')
      setValue('odometerKm', '')
    } else if (!values.vehicleId && vehicles[0]) {
      setValue('vehicleId', vehicles[0].id)
    }
  }

  /**
   * The write is assembled here and validated by the server action, which parses
   * it with `expenseWriteSchema` — the one schema for this entity. The schema is
   * imported here as a type only, deliberately: zod is around seventy kilobytes
   * gzipped and this form has exactly two failure modes a person can reach, both
   * checked below. See AUTOPILOT-NOTES.md.
   */
  const submit = handleSubmit((form) => {
    setFormError(null)

    const parsedAmount = parseAmount(form.amountText, currency)
    if (parsedAmount === null || parsedAmount === 0) {
      setFormError('Enter an amount')
      amountRef.current?.focus()
      return
    }

    if (!isIsoDate(form.occurredOn)) {
      setFormError('Pick a date')
      return
    }

    const odometer = form.odometerKm.trim() === '' ? null : Number(form.odometerKm)
    const trimmed = (value: string) => (value.trim() === '' ? null : value.trim())

    const write: ExpenseWrite = {
      id: initial?.id ?? crypto.randomUUID(),
      occurred_on: form.occurredOn,
      amount: parsedAmount,
      currency,
      category_id: form.categoryId || null,
      vehicle_id: bucket === 'life' ? null : form.vehicleId || null,
      bucket,
      counts_toward_budget: countsTowardBudget,
      amortize_months: form.amortizeMonths,
      merchant: trimmed(form.merchant),
      note: trimmed(form.note),
      odometer_km: bucket === 'life' || Number.isNaN(odometer) ? null : odometer,
    }

    const row = draftLedgerRow(write, {
      category,
      vehicle,
      createdAt: initial?.created_at ?? new Date().toISOString(),
      attachmentCount: initial?.attachment_count ?? 0,
    })

    const perform = (): Promise<ActionResult> =>
      mode === 'create' ? createExpenseAction(write) : updateExpenseAction(write)

    store.run({ kind: 'save', row, previous: initial ?? null }, perform)
    onDone()
  })

  return (
    <form onSubmit={submit} className="flex min-h-0 flex-1 flex-col">
      <div className="min-h-0 flex-1 space-y-5 overflow-y-auto px-4 py-4">
        <Field
          label="Amount"
          htmlFor="expense-amount"
          hint={hint ?? 'Type 150k or 1.2m if that is quicker.'}
          error={formError}
        >
          <input
            id="expense-amount"
            inputMode="decimal"
            autoComplete="off"
            enterKeyHint="done"
            placeholder="0"
            className={`${INPUT_CLASS} font-mono text-odometer-lg`}
            {...amountField}
            ref={(element) => {
              amountField.ref(element)
              amountRef.current = element
            }}
          />
        </Field>

        <div className="space-y-2">
          <p className="text-label text-ink-muted">Category</p>
          <CategoryChips
            categories={categories}
            icons={icons}
            value={values.categoryId}
            onChange={(id) => setValue('categoryId', id)}
          />
          {forcedToLife ? (
            <p className="text-caption text-ink-muted">
              No vehicle attached, so this is life spend.
            </p>
          ) : null}
        </div>

        {suggestSpread ? (
          <div className="rounded-md border border-border bg-surface-sunken p-3">
            <AmortiseField
              months={values.amortizeMonths}
              onChange={(months) => setValue('amortizeMonths', months)}
              amount={amount}
              currency={currency}
              locale={locale}
              occurredOn={occurredOn}
              suggested
            />
          </div>
        ) : null}

        <details className="rounded-md border border-border">
          <summary className="min-h-touch cursor-pointer list-none px-3 py-3 text-label text-ink-muted marker:content-none">
            More
          </summary>

          <div className="space-y-5 border-t border-border px-3 py-4">
            <Field label="Date" htmlFor="expense-date">
              <input
                id="expense-date"
                type="date"
                className={`${INPUT_CLASS} font-mono`}
                {...register('occurredOn')}
              />
            </Field>

            <Field
              label="Vehicle"
              htmlFor="expense-vehicle"
              hint={
                vehicles.length === 0
                  ? 'No vehicles yet. Car buckets need one.'
                  : 'Attaching a vehicle moves this into a car bucket.'
              }
            >
              <select
                id="expense-vehicle"
                className={INPUT_CLASS}
                value={values.vehicleId}
                onChange={(event) => {
                  const next = event.target.value
                  setValue('vehicleId', next)
                  setValue('bucketOverride', '')
                  if (next === '') setValue('odometerKm', '')
                }}
              >
                <option value="">No vehicle</option>
                {vehicles.map((entry) => (
                  <option key={entry.id} value={entry.id}>
                    {entry.nickname}
                  </option>
                ))}
              </select>
            </Field>

            <div className="space-y-2">
              <p className="text-label text-ink-muted">Bucket</p>
              <BucketChips
                value={bucket}
                onChange={chooseBucket}
                vehicleAttached={vehicle !== null}
                canAttachVehicle={vehicles.length > 0}
              />
            </div>

            <div className="space-y-2">
              <p className="text-label text-ink-muted">Budget impact</p>
              <BudgetImpactSwitch
                checked={countsTowardBudget}
                occurredOn={occurredOn}
                onChange={(next) => setValue('countsOverride', next ? 'yes' : 'no')}
              />
            </div>

            {suggestSpread ? null : (
              <div className="space-y-2">
                <p className="text-label text-ink-muted">Spread over months</p>
                <AmortiseField
                  months={values.amortizeMonths}
                  onChange={(months) => setValue('amortizeMonths', months)}
                  amount={amount}
                  currency={currency}
                  locale={locale}
                  occurredOn={occurredOn}
                />
              </div>
            )}

            <Field label="Merchant" htmlFor="expense-merchant">
              <input
                id="expense-merchant"
                className={INPUT_CLASS}
                autoComplete="off"
                {...register('merchant')}
              />
            </Field>

            <Field label="Note" htmlFor="expense-note">
              <textarea
                id="expense-note"
                rows={3}
                className={`${INPUT_CLASS} py-2`}
                {...register('note')}
              />
            </Field>

            {vehicle ? (
              <Field
                label="Odometer"
                htmlFor="expense-odometer"
                hint={`Last known reading ${vehicle.odometer_km.toLocaleString(locale)} km.`}
              >
                <input
                  id="expense-odometer"
                  type="number"
                  inputMode="numeric"
                  min={0}
                  className={`${INPUT_CLASS} font-mono`}
                  {...register('odometerKm')}
                />
              </Field>
            ) : null}

            <Field label="Photos" hint="Photo upload arrives with the timeline in Phase 4.">
              <button
                type="button"
                disabled
                className={`${INPUT_CLASS} flex items-center text-ink-faint`}
              >
                Add photos
              </button>
            </Field>
          </div>
        </details>
      </div>

      <div
        className="border-t border-border bg-surface px-4 py-3"
        style={{ paddingBottom: 'calc(var(--space-3) + env(safe-area-inset-bottom))' }}
      >
        <Button type="submit" variant="primary" className="w-full" disabled={formState.isSubmitting}>
          {mode === 'create' ? 'Log expense' : 'Save changes'}
        </Button>
      </div>
    </form>
  )
}
