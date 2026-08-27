// A form with an upload field in it: browser work from top to bottom.
'use client'

import dynamic from 'next/dynamic'
import { useMemo, useState } from 'react'
import { useForm } from 'react-hook-form'

import {
  createTimelineNoteAction,
  updateTimelineNoteAction,
} from '@/app/(app)/timeline/actions'
import { Button } from '@/components/ui/button'
import { Field, INPUT_CLASS } from '@/components/ui/field'
import { useToast } from '@/components/ui/toast'
import { isIsoDate, type IsoDate } from '@/lib/dates'
import type { AttachmentDraft, AttachmentView } from '@/lib/attachments/types'
import type { TimelineNoteWrite } from '@/lib/timeline/schema'

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

export type TimelineNoteFormProps = {
  mode: 'create' | 'edit'
  userId: string
  vehicleId: string
  /** The vehicle's last known reading, for the hint under the odometer field. */
  lastReading: number
  locale: string
  today: IsoDate
  initial?: {
    id: string
    occurred_on: IsoDate
    title: string
    body: string | null
    odometer_km: number | null
  } | null
  initialAttachments?: readonly AttachmentView[]
  onDone: () => void
}

type Values = {
  occurredOn: string
  title: string
  body: string
  odometerKm: string
}

/**
 * A timeline note: a drive, a meet, a wash, a thought.
 *
 * It is the cost-free half of the build log (docs/01-PRODUCT.md), and the whole
 * design of it is what it does *not* have — no amount, no category, no bucket,
 * no budget switch. An entry that cost money is an expense and belongs in the
 * ledger; this is for the days that did not.
 *
 * The write is awaited rather than optimistic. A note is written from a sheet
 * that is about to close onto the feed the note lands in, and the photos have to
 * be stored before the feed can show them.
 */
export function TimelineNoteForm({
  mode,
  userId,
  vehicleId,
  lastReading,
  locale,
  today,
  initial,
  initialAttachments,
  onDone,
}: TimelineNoteFormProps) {
  const { show } = useToast()
  const [formError, setFormError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  const [attachments, setAttachments] = useState<AttachmentDraft[]>(() =>
    (initialAttachments ?? []).map(({ url: _url, ...draft }) => draft),
  )
  const attachmentUrls = useMemo(() => {
    const map: Record<string, string | null> = {}
    for (const view of initialAttachments ?? []) map[view.id] = view.url
    return map
  }, [initialAttachments])

  const { register, handleSubmit, watch } = useForm<Values>({
    defaultValues: {
      occurredOn: initial?.occurred_on ?? today,
      title: initial?.title ?? '',
      body: initial?.body ?? '',
      odometerKm: initial?.odometer_km === null || initial === undefined ? '' : String(initial?.odometer_km ?? ''),
    },
  })

  const values = watch()

  const typedOdometer = values.odometerKm.trim() === '' ? null : Number(values.odometerKm)
  const belowLastReading =
    typedOdometer !== null && Number.isFinite(typedOdometer) && typedOdometer < lastReading

  const submit = handleSubmit(async (form) => {
    setFormError(null)

    if (form.title.trim() === '') {
      setFormError('Give the entry a title')
      return
    }
    if (!isIsoDate(form.occurredOn)) {
      setFormError('Pick a date')
      return
    }

    const odometer = form.odometerKm.trim() === '' ? null : Number(form.odometerKm)

    const write: TimelineNoteWrite = {
      id: initial?.id ?? crypto.randomUUID(),
      vehicle_id: vehicleId,
      occurred_on: form.occurredOn,
      title: form.title.trim(),
      body: form.body.trim() === '' ? null : form.body.trim(),
      odometer_km: odometer === null || Number.isNaN(odometer) ? null : odometer,
    }

    setSaving(true)
    const result =
      mode === 'create'
        ? await createTimelineNoteAction(write, attachments)
        : await updateTimelineNoteAction(write, attachments)
    setSaving(false)

    if (!result.ok) {
      setFormError(result.error)
      return
    }

    show(mode === 'create' ? 'Entry added' : 'Entry saved')
    onDone()
  })

  return (
    <form onSubmit={submit} className="flex min-h-0 flex-1 flex-col">
      <div className="min-h-0 flex-1 space-y-5 overflow-y-auto overflow-x-hidden px-4 py-4">
        <Field label="Title" htmlFor="note-title" error={formError}>
          <input
            id="note-title"
            className={INPUT_CLASS}
            autoComplete="off"
            placeholder="Sunday drive to Ba Vi"
            {...register('title')}
          />
        </Field>

        <Field label="Date" htmlFor="note-date">
          <input
            id="note-date"
            type="date"
            className={`${INPUT_CLASS} font-mono`}
            {...register('occurredOn')}
          />
        </Field>

        <Field
          label="Odometer"
          htmlFor="note-odometer"
          hint={
            belowLastReading
              ? `Lower than last reading (${lastReading.toLocaleString(locale)} km). Saved as typed.`
              : `Last known reading ${lastReading.toLocaleString(locale)} km. Optional.`
          }
        >
          <input
            id="note-odometer"
            type="number"
            inputMode="numeric"
            min={0}
            className={`${INPUT_CLASS} font-mono`}
            {...register('odometerKm')}
          />
        </Field>

        <Field label="Notes" htmlFor="note-body">
          <textarea id="note-body" rows={4} className={`${INPUT_CLASS} py-2`} {...register('body')} />
        </Field>

        <AttachmentField
          userId={userId}
          vehicleId={vehicleId}
          owner="timeline_note"
          value={attachments}
          onChange={setAttachments}
          urls={attachmentUrls}
          context={values.title.trim() || 'this entry'}
        />
      </div>

      <div
        className="border-t border-border bg-surface px-4 py-3"
        style={{ paddingBottom: 'calc(var(--space-3) + env(safe-area-inset-bottom))' }}
      >
        <Button type="submit" variant="primary" className="w-full" disabled={saving}>
          {mode === 'create' ? 'Add entry' : 'Save entry'}
        </Button>
      </div>
    </form>
  )
}
