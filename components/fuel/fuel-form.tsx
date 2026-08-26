// Parsing as you type is the whole point of this form.
'use client'

import dynamic from 'next/dynamic'
import { useMemo, useState } from 'react'
import { useForm } from 'react-hook-form'

import {
  createFuelLogAction,
  deleteFuelLogAction,
  updateFuelLogAction,
} from '@/app/(app)/fuel/actions'
import { LinkedExpenseField } from '@/components/expenses/linked-expense-field'
import { Button } from '@/components/ui/button'
import { Field, INPUT_CLASS } from '@/components/ui/field'
import { Money } from '@/components/ui/money'
import { useToast } from '@/components/ui/toast'
import type { AttachmentDraft, AttachmentView } from '@/lib/attachments/types'
import type { IsoDate } from '@/lib/dates'
import { buildLinkedExpense, defaultCategory } from '@/lib/expenses/linked'
import type { CategoryOption } from '@/lib/expenses/types'
import type { FuelLogWrite } from '@/lib/fuel/schema'
import { pricePerLitre, type FuelLog } from '@/lib/fuel/types'
import { formatAmount, parseAmount } from '@/lib/money'
import type { ReactNode } from 'react'

const AttachmentField = dynamic(
  () => import('@/components/attachments/attachment-field').then((module) => module.AttachmentField),
  {
    ssr: false,
    loading: () => (
      <div className="space-y-2">
        <p className="text-label text-ink-muted">Photos</p>
        <div className="h-touch rounded-md bg-surface-sunken" />
      </div>
    ),
  },
)

export type FuelFormProps = {
  mode: 'create' | 'edit'
  vehicleId: string
  userId: string
  initial?: FuelLog | null
  initialAttachments?: readonly AttachmentView[]
  /** The vehicle's last known reading, pre-filled on a new fill-up. */
  lastReading: number
  categories: readonly CategoryOption[]
  icons: Record<string, ReactNode>
  currency: string
  locale: string
  today: IsoDate
  onDone: () => void
}

type Values = {
  filledOn: string
  odometerKm: string
  litresText: string
  costText: string
  station: string
}

/**
 * A fill-up.
 *
 * The phase brief: "Derive and show price-per-litre live as the user types, so a
 * typo is obvious." That line under the two fields is the whole reason this form
 * is worth having rather than an expense with a note on it — a pump price is a
 * number you know to within a few hundred dong, so a decimal point in the wrong
 * place announces itself before Save is ever pressed.
 *
 * The full-tank switch is on by default, because most fills are. Turning it off
 * says the litres accumulate into the next full tank rather than closing an
 * interval; the caption says so in words, because the consequence — no
 * consumption figure from this one — is not obvious from the label.
 *
 * "Missed a fill-up" is the honest escape hatch. It breaks the chain rather than
 * letting one unlogged tank quietly halve the next figure.
 */
export function FuelForm({
  mode,
  vehicleId,
  userId,
  initial,
  initialAttachments,
  lastReading,
  categories,
  icons,
  currency,
  locale,
  today,
  onDone,
}: FuelFormProps) {
  const toast = useToast()
  const [formError, setFormError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  const [isFullTank, setIsFullTank] = useState(initial?.is_full_tank ?? true)
  const [missedPrevious, setMissedPrevious] = useState(initial?.missed_previous ?? false)

  const [attachments, setAttachments] = useState<AttachmentDraft[]>(
    () => (initialAttachments ?? []).map(({ url: _url, ...draft }) => draft),
  )
  const attachmentUrls = useMemo(() => {
    const map: Record<string, string | null> = {}
    for (const view of initialAttachments ?? []) map[view.id] = view.url
    return map
  }, [initialAttachments])

  const [logExpense, setLogExpense] = useState(mode === 'create')
  const [categoryId, setCategoryId] = useState(
    () => defaultCategory(categories, 'Fuel', 'car_running')?.id ?? '',
  )

  const { register, handleSubmit, watch } = useForm<Values>({
    defaultValues: {
      filledOn: initial?.filled_on ?? today,
      odometerKm: String(initial?.odometer_km ?? lastReading),
      litresText: initial ? String(initial.litres) : '',
      costText: initial ? formatAmount(initial.total_cost, initial.currency, { locale }) : '',
      station: initial?.station ?? '',
    },
  })

  const values = watch()

  const litres = Number(values.litresText)
  const validLitres = values.litresText.trim() !== '' && Number.isFinite(litres) && litres > 0
  const cost = parseAmount(values.costText, currency)
  const perLitre = pricePerLitre(cost, validLitres ? litres : null)

  const filledOn = /^\d{4}-\d{2}-\d{2}$/.test(values.filledOn) ? values.filledOn : today

  const submit = handleSubmit(async (form) => {
    setFormError(null)

    const odometer = Number(form.odometerKm)
    if (!Number.isFinite(odometer) || form.odometerKm.trim() === '') {
      setFormError('Enter the reading on the clock')
      return
    }
    if (!validLitres) {
      setFormError('Enter how many litres went in')
      return
    }
    const totalCost = parseAmount(form.costText, currency)
    if (totalCost === null) {
      setFormError('Enter what it cost')
      return
    }

    const log: FuelLogWrite = {
      id: initial?.id ?? crypto.randomUUID(),
      vehicle_id: vehicleId,
      filled_on: filledOn,
      odometer_km: Math.trunc(odometer),
      litres: Math.round(litres * 1000) / 1000,
      total_cost: totalCost,
      currency,
      is_full_tank: isFullTank,
      missed_previous: missedPrevious,
      station: form.station.trim() === '' ? null : form.station.trim(),
    }

    setSaving(true)
    const result =
      mode === 'create'
        ? await createFuelLogAction(
            {
              log,
              expense: logExpense
                ? buildLinkedExpense({
                    amount: totalCost,
                    currency,
                    occurredOn: log.filled_on,
                    vehicleId,
                    category: categories.find((entry) => entry.id === categoryId) ?? null,
                    merchant: log.station,
                    note: null,
                    odometerKm: log.odometer_km,
                  })
                : null,
            },
            attachments,
          )
        : await updateFuelLogAction(log, attachments)
    setSaving(false)

    if (!result.ok) {
      setFormError(result.error)
      return
    }

    onDone()
  })

  async function remove() {
    if (!initial) return
    setSaving(true)
    const result = await deleteFuelLogAction(initial.id)
    setSaving(false)
    if (!result.ok) {
      setFormError(result.error)
      return
    }
    onDone()
    toast.show('Fill-up removed')
  }

  return (
    <form onSubmit={submit} className="flex min-h-0 flex-1 flex-col">
      <div className="min-h-0 flex-1 space-y-5 overflow-y-auto px-4 py-4">
        <div className="grid grid-cols-2 gap-3">
          <Field label="Date" htmlFor="fuel-date" error={formError}>
            <input
              id="fuel-date"
              type="date"
              className={`${INPUT_CLASS} font-mono`}
              {...register('filledOn')}
            />
          </Field>
          <Field
            label="Odometer"
            htmlFor="fuel-odometer"
            hint={`Last known ${lastReading.toLocaleString(locale)} km.`}
          >
            <input
              id="fuel-odometer"
              type="number"
              inputMode="numeric"
              min={0}
              className={`${INPUT_CLASS} font-mono`}
              {...register('odometerKm')}
            />
          </Field>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <Field label="Litres" htmlFor="fuel-litres">
            <input
              id="fuel-litres"
              inputMode="decimal"
              autoComplete="off"
              placeholder="40"
              className={`${INPUT_CLASS} font-mono`}
              {...register('litresText')}
            />
          </Field>
          <Field label="Total cost" htmlFor="fuel-cost">
            <input
              id="fuel-cost"
              inputMode="decimal"
              autoComplete="off"
              placeholder="920k"
              className={`${INPUT_CLASS} font-mono`}
              {...register('costText')}
            />
          </Field>
        </div>

        {/* The derived figure, live. A misplaced decimal in either field above
            shows up here as a price nobody has ever paid for a litre of fuel. */}
        <p className="flex items-baseline justify-between gap-4 rounded-md bg-surface-sunken px-3 py-2">
          <span className="text-label text-ink-muted">Price per litre</span>
          {perLitre === null ? (
            <span className="font-mono text-odometer text-ink-faint">&mdash;</span>
          ) : (
            <Money amount={perLitre} currency={currency} locale={locale} />
          )}
        </p>

        <div className="space-y-2 rounded-md border border-border p-3">
          <button
            type="button"
            role="switch"
            aria-checked={isFullTank}
            onClick={() => setIsFullTank(!isFullTank)}
            className="flex min-h-touch w-full items-center justify-between gap-4 text-left"
          >
            <span className="text-body text-ink">Filled to the top</span>
            <Toggle on={isFullTank} />
          </button>
          <p className="text-caption text-ink-muted">
            {isFullTank
              ? 'Closes the interval since the last full tank, so this fill produces a consumption figure.'
              : 'These litres carry forward into the next full tank. No figure comes from this one on its own.'}
          </p>

          <button
            type="button"
            role="switch"
            aria-checked={missedPrevious}
            onClick={() => setMissedPrevious(!missedPrevious)}
            className="flex min-h-touch w-full items-center justify-between gap-4 border-t border-border pt-2 text-left"
          >
            <span className="text-body text-ink">A fill-up before this went unlogged</span>
            <Toggle on={missedPrevious} />
          </button>
          <p className="text-caption text-ink-muted">
            {missedPrevious
              ? 'This interval is skipped rather than averaged over. The chain picks up again after it.'
              : 'Every litre since the last fill is accounted for.'}
          </p>
        </div>

        <Field label="Station" htmlFor="fuel-station">
          <input
            id="fuel-station"
            className={INPUT_CLASS}
            autoComplete="off"
            {...register('station')}
          />
        </Field>

        {mode === 'create' ? (
          <LinkedExpenseField
            enabled={logExpense}
            onEnabled={setLogExpense}
            amountText={values.costText}
            onAmountText={() => undefined}
            categoryId={categoryId}
            onCategoryId={setCategoryId}
            categories={categories}
            icons={icons}
            currency={currency}
            locale={locale}
            occurredOn={filledOn}
            label="Put it in the ledger too"
            amountReadOnly
          />
        ) : (
          <p className="rounded-md border border-border bg-surface-sunken p-3 text-caption text-ink-muted">
            {initial?.expense_id
              ? 'The linked expense moves with this fill-up: the amount, the date and the station.'
              : 'This fill-up has no expense against it. Add one from the ledger if it should.'}
          </p>
        )}

        <AttachmentField
          userId={userId}
          vehicleId={vehicleId}
          owner="fuel_log"
          value={attachments}
          onChange={setAttachments}
          urls={attachmentUrls}
          context={values.station.trim() || 'this fill-up'}
        />

        {mode === 'edit' && initial ? (
          <Button variant="danger" className="w-full" onClick={remove} disabled={saving}>
            Delete this fill-up
          </Button>
        ) : null}
      </div>

      <div
        className="border-t border-border bg-surface px-4 py-3"
        style={{ paddingBottom: 'calc(var(--space-3) + env(safe-area-inset-bottom))' }}
      >
        <Button type="submit" variant="primary" className="w-full" disabled={saving}>
          {mode === 'create' ? 'Add fill-up' : 'Save changes'}
        </Button>
      </div>
    </form>
  )
}

/** The same switch the budget-impact control uses, at the size it uses. */
function Toggle({ on }: { on: boolean }) {
  return (
    <span
      aria-hidden
      className="relative inline-flex h-6 w-12 shrink-0 rounded-full border transition-colors duration-state ease-enter"
      style={{
        backgroundColor: on ? 'var(--positive)' : 'var(--surface-sunken)',
        borderColor: on ? 'var(--positive)' : 'var(--border-strong)',
      }}
    >
      <span
        className="absolute top-px size-5 rounded-full bg-surface transition-[left] duration-state ease-enter"
        style={{ left: on ? 'calc(100% - 21px)' : '1px' }}
      />
    </span>
  )
}
