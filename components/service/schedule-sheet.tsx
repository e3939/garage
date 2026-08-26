// A form: text, two intervals and a delete.
'use client'

import { useState } from 'react'
import { useForm } from 'react-hook-form'

import {
  createServiceScheduleAction,
  setServiceScheduleArchivedAction,
  updateServiceScheduleAction,
} from '@/app/(app)/service/actions'
import { Button } from '@/components/ui/button'
import { Field, INPUT_CLASS } from '@/components/ui/field'
import { useToast } from '@/components/ui/toast'
import type { IsoDate } from '@/lib/dates'
import type { ServiceScheduleWrite } from '@/lib/service/schema'
import type { ServiceDue } from '@/lib/service/types'

export type ScheduleSheetProps = {
  mode: 'create' | 'edit'
  vehicleId: string
  locale: string
  initial?: ServiceDue | null
  onDone: () => void
}

type Values = {
  name: string
  intervalKm: string
  intervalMonths: string
  lastDoneKm: string
  lastDoneOn: string
  notes: string
}

function defaults(initial: ServiceDue | null | undefined): Values {
  return {
    name: initial?.name ?? '',
    intervalKm: initial?.interval_km == null ? '' : String(initial.interval_km),
    intervalMonths: initial?.interval_months == null ? '' : String(initial.interval_months),
    lastDoneKm: initial?.last_done_km == null ? '' : String(initial.last_done_km),
    lastDoneOn: initial?.last_done_on ?? '',
    notes: initial?.notes ?? '',
  }
}

const whole = (value: string): number | null => {
  const trimmed = value.trim()
  if (trimmed === '') return null
  const parsed = Number(trimmed)
  return Number.isFinite(parsed) ? Math.trunc(parsed) : null
}

/**
 * One line of the service book: what it is, and how often.
 *
 * The two intervals are independent and either may be empty — brake fluid is
 * time only, spark plugs are distance only — but not both, which is a check
 * constraint on the table as well as a rule here, because an item with neither
 * can never come due.
 *
 * "Last done" is editable because the seeded set arrives blank and the real
 * answer is usually on a sticker in the door jamb. It is normally maintained by
 * the trigger that rolls service records up, so typing here is for the history
 * you have but never logged.
 */
export function ScheduleSheet({ mode, vehicleId, locale, initial, onDone }: ScheduleSheetProps) {
  const toast = useToast()
  const [formError, setFormError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  const { register, handleSubmit } = useForm<Values>({ defaultValues: defaults(initial) })

  const submit = handleSubmit(async (form) => {
    setFormError(null)

    if (form.name.trim() === '') {
      setFormError('Name the service item')
      return
    }

    const intervalKm = whole(form.intervalKm)
    const intervalMonths = whole(form.intervalMonths)
    if (intervalKm === null && intervalMonths === null) {
      setFormError('Give it a distance, a time, or both')
      return
    }

    const write: ServiceScheduleWrite = {
      id: initial?.schedule_id ?? crypto.randomUUID(),
      vehicle_id: vehicleId,
      name: form.name.trim(),
      interval_km: intervalKm,
      interval_months: intervalMonths,
      last_done_km: whole(form.lastDoneKm),
      last_done_on: (form.lastDoneOn === '' ? null : form.lastDoneOn) as IsoDate | null,
      notes: form.notes.trim() === '' ? null : form.notes.trim(),
    }

    setSaving(true)
    const result =
      mode === 'create'
        ? await createServiceScheduleAction(write)
        : await updateServiceScheduleAction(write)
    setSaving(false)

    if (!result.ok) {
      setFormError(result.error)
      return
    }

    onDone()
  })

  async function remove() {
    if (!initial) return
    const id = initial.schedule_id
    setSaving(true)
    const result = await setServiceScheduleArchivedAction({ id, archived: true })
    setSaving(false)

    if (!result.ok) {
      setFormError(result.error)
      return
    }

    onDone()
    toast.show(`${initial.name} removed`, {
      label: 'Undo',
      run: () => {
        void setServiceScheduleArchivedAction({ id, archived: false })
      },
    })
  }

  return (
    <form onSubmit={submit} className="flex min-h-0 flex-1 flex-col">
      <div className="min-h-0 flex-1 space-y-5 overflow-y-auto px-4 py-4">
        <Field label="What is it" htmlFor="schedule-name" error={formError}>
          <input
            id="schedule-name"
            className={INPUT_CLASS}
            autoComplete="off"
            placeholder="Engine oil + filter"
            {...register('name')}
          />
        </Field>

        <div className="grid grid-cols-2 gap-3">
          <Field label="Every (km)" htmlFor="schedule-km" hint="Leave blank for time only.">
            <input
              id="schedule-km"
              type="number"
              inputMode="numeric"
              min={1}
              placeholder="5000"
              className={`${INPUT_CLASS} font-mono`}
              {...register('intervalKm')}
            />
          </Field>
          <Field label="Every (months)" htmlFor="schedule-months" hint="Leave blank for distance only.">
            <input
              id="schedule-months"
              type="number"
              inputMode="numeric"
              min={1}
              placeholder="6"
              className={`${INPUT_CLASS} font-mono`}
              {...register('intervalMonths')}
            />
          </Field>
        </div>

        <div className="space-y-1">
          <p className="text-label text-ink-muted">Last done</p>
          <div className="grid grid-cols-2 gap-3">
            <input
              aria-label="Odometer when it was last done"
              type="number"
              inputMode="numeric"
              min={0}
              placeholder="Odometer"
              className={`${INPUT_CLASS} font-mono`}
              {...register('lastDoneKm')}
            />
            <input
              aria-label="Date it was last done"
              type="date"
              className={`${INPUT_CLASS} font-mono`}
              {...register('lastDoneOn')}
            />
          </div>
          <p className="text-caption text-ink-muted">
            {initial && initial.basis === 'purchase'
              ? `Blank, so the interval runs from the day you took the car on at ${initial.basis_km.toLocaleString(locale)} km.`
              : 'Marking it done keeps this up to date. Fill it in for work you did before the app.'}
          </p>
        </div>

        <Field label="Notes" htmlFor="schedule-notes">
          <textarea
            id="schedule-notes"
            rows={2}
            className={`${INPUT_CLASS} py-2`}
            placeholder="Which oil, which filter, who does it."
            {...register('notes')}
          />
        </Field>

        {mode === 'edit' && initial ? (
          <Button variant="danger" className="w-full" onClick={remove} disabled={saving}>
            Remove from the schedule
          </Button>
        ) : null}
      </div>

      <div
        className="border-t border-border bg-surface px-4 py-3"
        style={{ paddingBottom: 'calc(var(--space-3) + env(safe-area-inset-bottom))' }}
      >
        <Button type="submit" variant="primary" className="w-full" disabled={saving}>
          {mode === 'create' ? 'Add to the schedule' : 'Save changes'}
        </Button>
      </div>
    </form>
  )
}
