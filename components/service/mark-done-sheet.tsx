// One sheet, two writes, one confirmation.
'use client'

import dynamic from 'next/dynamic'
import { useState } from 'react'
import { useForm } from 'react-hook-form'

import { markServiceDoneAction } from '@/app/(app)/service/actions'
import { LinkedExpenseField } from '@/components/expenses/linked-expense-field'
import { Button } from '@/components/ui/button'
import { Field, INPUT_CLASS } from '@/components/ui/field'
import type { AttachmentDraft } from '@/lib/attachments/types'
import type { IsoDate } from '@/lib/dates'
import { buildLinkedExpense, defaultCategory } from '@/lib/expenses/linked'
import type { CategoryOption } from '@/lib/expenses/types'
import { parseAmount } from '@/lib/money'
import type { ServiceRecordWrite } from '@/lib/service/schema'
import type { ServiceDue } from '@/lib/service/types'
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

export type MarkDoneSheetProps = {
  vehicleId: string
  userId: string
  /** The schedule being marked done, or null for one-off work. */
  schedule: ServiceDue | null
  /** The vehicle's last known reading, pre-filled and editable. */
  lastReading: number
  categories: readonly CategoryOption[]
  icons: Record<string, ReactNode>
  currency: string
  locale: string
  today: IsoDate
  onDone: () => void
}

type Values = {
  name: string
  performedOn: string
  odometerKm: string
  workshop: string
  notes: string
}

/**
 * "Mark done" — the record and the expense in one flow, one confirmation.
 *
 * docs/01-PRODUCT.md, section D: "Completing a service creates a service record
 * and optionally an expense in one step." So there is one Save button and it
 * writes both, and the expense is a switch rather than a second screen. The two
 * land together or neither does: `markServiceDoneAction` takes the expense back
 * out if the record is refused.
 *
 * The odometer is pre-filled with the car's last known reading, because you are
 * almost always standing next to the car when you do this and the number on the
 * clock is the number you would type.
 *
 * The write is awaited rather than optimistic. It moves the schedule, the gauge
 * on the vehicle home and possibly the month's total, and a sheet that had
 * already closed could not show what went wrong.
 */
export function MarkDoneSheet({
  vehicleId,
  userId,
  schedule,
  lastReading,
  categories,
  icons,
  currency,
  locale,
  today,
  onDone,
}: MarkDoneSheetProps) {
  const [formError, setFormError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [attachments, setAttachments] = useState<AttachmentDraft[]>([])

  const [logExpense, setLogExpense] = useState(true)
  const [amountText, setAmountText] = useState('')
  const [categoryId, setCategoryId] = useState(
    () => defaultCategory(categories, 'Maintenance', 'car_running')?.id ?? '',
  )

  const { register, handleSubmit, watch } = useForm<Values>({
    defaultValues: {
      name: schedule?.name ?? '',
      performedOn: today,
      odometerKm: String(lastReading),
      workshop: '',
      notes: '',
    },
  })

  const values = watch()
  const performedOn = /^\d{4}-\d{2}-\d{2}$/.test(values.performedOn) ? values.performedOn : today

  const submit = handleSubmit(async (form) => {
    setFormError(null)

    if (form.name.trim() === '') {
      setFormError('Name the work')
      return
    }

    const odometer = form.odometerKm.trim() === '' ? null : Number(form.odometerKm)

    const record: ServiceRecordWrite = {
      id: crypto.randomUUID(),
      vehicle_id: vehicleId,
      schedule_id: schedule?.schedule_id ?? null,
      name: form.name.trim(),
      performed_on: performedOn,
      odometer_km: odometer === null || Number.isNaN(odometer) ? null : Math.trunc(odometer),
      workshop: form.workshop.trim() === '' ? null : form.workshop.trim(),
      notes: form.notes.trim() === '' ? null : form.notes.trim(),
    }

    const expense = logExpense
      ? buildLinkedExpense({
          amount: parseAmount(amountText, currency),
          currency,
          occurredOn: record.performed_on,
          vehicleId,
          category: categories.find((entry) => entry.id === categoryId) ?? null,
          merchant: record.workshop,
          note: record.name,
          odometerKm: record.odometer_km,
        })
      : null

    setSaving(true)
    const result = await markServiceDoneAction({ record, expense }, attachments)
    setSaving(false)

    if (!result.ok) {
      setFormError(result.error)
      return
    }

    onDone()
  })

  return (
    <form onSubmit={submit} className="flex min-h-0 flex-1 flex-col">
      <div className="min-h-0 flex-1 space-y-5 overflow-y-auto overflow-x-hidden px-4 py-4">
        <Field label="What was done" htmlFor="record-name" error={formError}>
          <input
            id="record-name"
            className={INPUT_CLASS}
            autoComplete="off"
            placeholder="Engine oil + filter"
            {...register('name')}
          />
        </Field>

        <div className="grid grid-cols-2 gap-3">
          <Field label="Date" htmlFor="record-date">
            <input
              id="record-date"
              type="date"
              className={`${INPUT_CLASS} font-mono`}
              {...register('performedOn')}
            />
          </Field>
          <Field
            label="Odometer"
            htmlFor="record-odometer"
            hint={`Last known ${lastReading.toLocaleString(locale)} km.`}
          >
            <input
              id="record-odometer"
              type="number"
              inputMode="numeric"
              min={0}
              className={`${INPUT_CLASS} font-mono`}
              {...register('odometerKm')}
            />
          </Field>
        </div>

        <Field label="Workshop" htmlFor="record-workshop" hint="Who did it, or leave blank if you did.">
          <input
            id="record-workshop"
            className={INPUT_CLASS}
            autoComplete="off"
            {...register('workshop')}
          />
        </Field>

        <LinkedExpenseField
          enabled={logExpense}
          onEnabled={setLogExpense}
          amountText={amountText}
          onAmountText={setAmountText}
          categoryId={categoryId}
          onCategoryId={setCategoryId}
          categories={categories}
          icons={icons}
          currency={currency}
          locale={locale}
          occurredOn={performedOn}
          label="Log what it cost"
        />

        <Field label="Notes" htmlFor="record-notes">
          <textarea
            id="record-notes"
            rows={2}
            className={`${INPUT_CLASS} py-2`}
            placeholder="Parts used, what they found, what to watch."
            {...register('notes')}
          />
        </Field>

        <AttachmentField
          userId={userId}
          vehicleId={vehicleId}
          owner="service_record"
          value={attachments}
          onChange={setAttachments}
          context={values.name.trim() || 'this service'}
        />
      </div>

      <div
        className="border-t border-border bg-surface px-4 py-3"
        style={{ paddingBottom: 'calc(var(--space-3) + env(safe-area-inset-bottom))' }}
      >
        <Button type="submit" variant="primary" className="w-full" disabled={saving}>
          Mark done
        </Button>
      </div>
    </form>
  )
}
