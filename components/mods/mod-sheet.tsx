// A form with chips, a list editor and an upload field in it.
'use client'

import dynamic from 'next/dynamic'
import { useMemo, useState } from 'react'
import { useForm } from 'react-hook-form'

import { createModAction, updateModAction } from '@/app/(app)/mods/actions'
import { AmountInput } from '@/components/ui/amount-input'
import { Button } from '@/components/ui/button'
import { Chip } from '@/components/ui/chip'
import { Field, INPUT_CLASS } from '@/components/ui/field'
import { Money } from '@/components/ui/money'
import { formatAmount, parseAmount, parsedAmountHint } from '@/lib/money'
import type { IsoDate } from '@/lib/dates'
import type { AttachmentDraft } from '@/lib/attachments/types'
import type { ModWrite } from '@/lib/mods/schema'
import {
  BOARD_STATUSES,
  MOD_PRIORITIES,
  MOD_PRIORITY_LABEL,
  MOD_STATUS_LABEL,
  blockers,
  type BoardStatus,
  type ModCard,
  type ModLink,
  type ModPriority,
} from '@/lib/mods/types'

const AttachmentField = dynamic(
  () => import('@/components/attachments/attachment-field').then((module) => module.AttachmentField),
  {
    ssr: false,
    loading: () => (
      <div className="space-y-2">
        <p className="text-label text-ink-muted">Inspiration</p>
        <div className="h-touch rounded-md bg-surface-sunken" />
      </div>
    ),
  },
)

/** The schema's ceiling, restated so the button can disable itself. */
const MAX_LINKS = 12

export type ModSheetProps = {
  mode: 'create' | 'edit'
  vehicleId: string
  currency: string
  locale: string
  today: IsoDate
  userId: string
  initial?: ModCard | null
  /** Every other live mod on this car — what a dependency may point at. */
  others: readonly ModCard[]
  /** Opens the expense form pre-filled. Absent while the mod is being created. */
  onInstall?: () => void
  onDone: () => void
}

type Values = {
  title: string
  description: string
  notes: string
  minText: string
  maxText: string
  targetDate: string
}

function defaults(initial: ModCard | null | undefined, currency: string, locale: string): Values {
  return {
    title: initial?.title ?? '',
    description: initial?.description ?? '',
    notes: initial?.notes ?? '',
    // Back into the field the way it would have been typed, exactly as the
    // expense form does it, so the exponent comes from `lib/money.ts` and never
    // from a literal (CLAUDE.md section 5).
    minText:
      initial?.est_cost_min === null || initial?.est_cost_min === undefined
        ? ''
        : formatAmount(initial.est_cost_min, initial.currency ?? currency, { locale }),
    maxText:
      initial?.est_cost_max === null || initial?.est_cost_max === undefined
        ? ''
        : formatAmount(initial.est_cost_max, initial.currency ?? currency, { locale }),
    targetDate: initial?.target_date ?? '',
  }
}

/**
 * The mod detail sheet: everything a plan holds.
 *
 * The write is awaited rather than optimistic. Creating a mod is not something
 * that happens six times a day the way logging an expense is, and the one error
 * this form can produce that the user has to read — a dependency loop, named —
 * only exists once the server has looked at the whole board. A sheet that had
 * already closed could not show it.
 */
export function ModSheet({
  mode,
  vehicleId,
  currency,
  locale,
  today,
  userId,
  initial,
  others,
  onInstall,
  onDone,
}: ModSheetProps) {
  const [formError, setFormError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  const [priority, setPriority] = useState<ModPriority>(initial?.priority ?? 'someday')
  const [status, setStatus] = useState<BoardStatus>(
    (BOARD_STATUSES as readonly string[]).includes(initial?.status ?? '')
      ? (initial?.status as BoardStatus)
      : 'dreaming',
  )
  const [links, setLinks] = useState<ModLink[]>(() => initial?.links.map((link) => ({ ...link })) ?? [])
  const [dependsOn, setDependsOn] = useState<string[]>(
    () => initial?.depends_on.map((entry) => entry.id) ?? [],
  )
  const [attachments, setAttachments] = useState<AttachmentDraft[]>(
    () => (initial?.photos ?? []).map(({ url: _url, ...draft }) => draft),
  )

  const attachmentUrls = useMemo(() => {
    const map: Record<string, string | null> = {}
    for (const view of initial?.photos ?? []) map[view.id] = view.url
    return map
  }, [initial])

  const { register, handleSubmit, setValue, watch } = useForm<Values>({
    defaultValues: defaults(initial, currency, locale),
  })

  const values = watch()

  const low = parseAmount(values.minText, currency)
  const high = parseAmount(values.maxText, currency)

  /** The number the install flow will put in the expense form. */
  const midpoint =
    low !== null && high !== null
      ? Math.trunc((low + high) / 2)
      : (high ?? low)

  const dependencyCards = useMemo(
    () => others.filter((card) => card.id !== initial?.id),
    [others, initial],
  )

  const blocked = useMemo(
    () =>
      blockers({
        depends_on: dependencyCards
          .filter((card) => dependsOn.includes(card.id))
          .map((card) => ({ id: card.id, title: card.title, status: card.status })),
      }),
    [dependencyCards, dependsOn],
  )

  const submit = handleSubmit(async (form) => {
    setFormError(null)

    if (form.title.trim() === '') {
      setFormError('Give the mod a name')
      return
    }
    if (low !== null && high !== null && low > high) {
      setFormError('The low end of the estimate is above the high end')
      return
    }

    const trimmed = (value: string) => (value.trim() === '' ? null : value.trim())

    const write: ModWrite = {
      id: initial?.id ?? crypto.randomUUID(),
      vehicle_id: vehicleId,
      title: form.title.trim(),
      description: trimmed(form.description),
      status,
      priority,
      est_cost_min: low,
      est_cost_max: high,
      currency,
      target_date: form.targetDate === '' ? null : form.targetDate,
      links: links.filter((link) => link.label.trim() !== '' && link.url.trim() !== ''),
      notes: trimmed(form.notes),
      installed_on: initial?.installed_on ?? (status === 'installed' ? today : null),
    }

    setSaving(true)
    const result =
      mode === 'create'
        ? await createModAction(write, attachments, dependsOn)
        : await updateModAction(write, attachments, dependsOn)
    setSaving(false)

    if (!result.ok) {
      setFormError(result.error)
      return
    }

    onDone()
  })

  return (
    <form onSubmit={submit} className="flex min-h-0 flex-1 flex-col">
      <div className="min-h-0 flex-1 space-y-5 overflow-y-auto px-4 py-4">
        <Field label="What is it" htmlFor="mod-title" error={formError}>
          <input
            id="mod-title"
            className={INPUT_CLASS}
            autoComplete="off"
            placeholder="Coilovers"
            {...register('title')}
          />
        </Field>

        <div className="space-y-2">
          <p className="text-label text-ink-muted">Priority</p>
          <div className="flex flex-wrap gap-2">
            {MOD_PRIORITIES.map((level) => (
              <Chip
                key={level}
                selected={priority === level}
                onSelect={() => setPriority(level)}
                accent="var(--bucket-car-project)"
              >
                {MOD_PRIORITY_LABEL[level]}
              </Chip>
            ))}
          </div>
          <p className="text-caption text-ink-muted">
            Named, not numbered. Nobody has a number for how much they want something.
          </p>
        </div>

        <Field label="Column" htmlFor="mod-status">
          <select
            id="mod-status"
            className={INPUT_CLASS}
            value={status}
            onChange={(event) => setStatus(event.target.value as BoardStatus)}
          >
            {BOARD_STATUSES.map((entry) => (
              <option key={entry} value={entry}>
                {MOD_STATUS_LABEL[entry]}
              </option>
            ))}
          </select>
        </Field>

        <div className="grid grid-cols-2 gap-3">
          <Field
            label="Estimate from"
            htmlFor="mod-min"
            hint={parsedAmountHint(values.minText, currency, locale) ?? 'Low end'}
          >
            <AmountInput
              id="mod-min"
              placeholder="0"
              currency={currency}
              locale={locale}
              value={values.minText}
              onValueChange={(text) => setValue('minText', text, { shouldDirty: true })}
            />
          </Field>
          <Field
            label="to"
            htmlFor="mod-max"
            hint={parsedAmountHint(values.maxText, currency, locale) ?? 'High end'}
          >
            <AmountInput
              id="mod-max"
              placeholder="0"
              currency={currency}
              locale={locale}
              value={values.maxText}
              onValueChange={(text) => setValue('maxText', text, { shouldDirty: true })}
            />
          </Field>
        </div>

        {midpoint !== null ? (
          <p className="text-caption text-ink-muted">
            {'Marking it installed starts the expense at '}
            <Money amount={midpoint} currency={currency} locale={locale} size="label" />
            {low !== null && high !== null && low !== high ? ', the middle of that range.' : '.'}
          </p>
        ) : null}

        <Field label="Target date" htmlFor="mod-target" hint="When you would like it done.">
          <input
            id="mod-target"
            type="date"
            className={`${INPUT_CLASS} font-mono`}
            {...register('targetDate')}
          />
        </Field>

        <Field label="Description" htmlFor="mod-description">
          <textarea
            id="mod-description"
            rows={3}
            className={`${INPUT_CLASS} py-2`}
            placeholder="What it is and why you want it."
            {...register('description')}
          />
        </Field>

        <LinksEditor links={links} onChange={setLinks} />

        {dependencyCards.length > 0 ? (
          <div className="space-y-2">
            <p className="text-label text-ink-muted">Needs first</p>
            <ul className="overflow-hidden rounded-md border border-border">
              {dependencyCards.map((card) => {
                const checked = dependsOn.includes(card.id)
                return (
                  <li key={card.id} className="border-b border-border last:border-b-0">
                    <label className="flex min-h-touch cursor-pointer items-center gap-3 px-3 py-2">
                      <input
                        type="checkbox"
                        className="size-5 accent-accent"
                        checked={checked}
                        onChange={(event) =>
                          setDependsOn((previous) =>
                            event.target.checked
                              ? [...previous, card.id]
                              : previous.filter((id) => id !== card.id),
                          )
                        }
                      />
                      <span className="min-w-0 flex-1 truncate text-body text-ink">
                        {card.title}
                      </span>
                      <span className="shrink-0 text-caption text-ink-faint">
                        {MOD_STATUS_LABEL[card.status]}
                      </span>
                    </label>
                  </li>
                )
              })}
            </ul>
            <p className="text-caption text-ink-muted">
              {blocked.length > 0
                ? `Blocked by: ${blocked.map((entry) => entry.title).join(', ')}. The card says so until they are installed.`
                : 'Nothing has to happen before this one.'}
            </p>
          </div>
        ) : null}

        <Field label="Notes" htmlFor="mod-notes">
          <textarea
            id="mod-notes"
            rows={3}
            className={`${INPUT_CLASS} py-2`}
            placeholder="Part numbers, sizes, who to call."
            {...register('notes')}
          />
        </Field>

        <AttachmentField
          userId={userId}
          vehicleId={vehicleId}
          owner="mod_plan"
          value={attachments}
          onChange={setAttachments}
          urls={attachmentUrls}
          context={values.title.trim() || 'this mod'}
          label="Inspiration"
        />

        {mode === 'edit' && initial ? (
          <PlanAgainstActual card={initial} locale={locale} />
        ) : null}
      </div>

      <div
        className="space-y-2 border-t border-border bg-surface px-4 py-3"
        style={{ paddingBottom: 'calc(var(--space-3) + env(safe-area-inset-bottom))' }}
      >
        {onInstall ? (
          <Button variant="secondary" className="w-full" onClick={onInstall}>
            {status === 'installed' ? 'Log another expense' : 'Mark installed'}
          </Button>
        ) : null}
        <Button type="submit" variant="primary" className="w-full" disabled={saving}>
          {mode === 'create' ? 'Add to the plan' : 'Save changes'}
        </Button>
      </div>
    </form>
  )
}

/** What it was going to cost, what it did, and the difference with a sign on it. */
function PlanAgainstActual({ card, locale }: { card: ModCard; locale: string }) {
  if (card.expense_count === 0) {
    return (
      <p className="rounded-md border border-border bg-surface-sunken p-3 text-caption text-ink-muted">
        No expense is linked to this mod yet. Marking it installed opens the expense form with the
        estimate already in it.
      </p>
    )
  }

  return (
    <dl className="space-y-1 rounded-md border border-border bg-surface-sunken p-3">
      <div className="flex items-baseline justify-between gap-4">
        <dt className="text-caption text-ink-muted">
          {card.expense_count === 1 ? 'Actual, 1 expense' : `Actual, ${card.expense_count} expenses`}
        </dt>
        <dd>
          <Money amount={card.actual} currency={card.currency} locale={locale} />
        </dd>
      </div>
      {card.estimate !== null ? (
        <>
          <div className="flex items-baseline justify-between gap-4">
            <dt className="text-caption text-ink-muted">Estimate</dt>
            <dd>
              <Money
                amount={card.estimate}
                currency={card.currency}
                locale={locale}
                size="label"
                className="text-ink-muted"
              />
            </dd>
          </div>
          <div className="flex items-baseline justify-between gap-4">
            <dt className="text-caption text-ink-muted">Variance</dt>
            <dd
              className={
                (card.variance ?? 0) > 0
                  ? 'text-critical'
                  : (card.variance ?? 0) < 0
                    ? 'text-positive'
                    : 'text-ink-muted'
              }
            >
              <Money
                amount={card.variance ?? 0}
                currency={card.currency}
                locale={locale}
                size="label"
                signDisplay="always"
              />
            </dd>
          </div>
        </>
      ) : null}
    </dl>
  )
}

type LinksEditorProps = {
  links: readonly ModLink[]
  onChange: (next: ModLink[]) => void
}

/**
 * Part links. A label and an address, because a bare URL in a list is a row you
 * have to read character by character to tell from the one above it.
 */
function LinksEditor({ links, onChange }: LinksEditorProps) {
  function set(index: number, patch: Partial<ModLink>) {
    onChange(links.map((link, position) => (position === index ? { ...link, ...patch } : link)))
  }

  return (
    <div className="space-y-2">
      <p className="text-label text-ink-muted">Links</p>

      {links.length > 0 ? (
        <ul className="space-y-2">
          {links.map((link, index) => (
            <li key={index} className="space-y-2 rounded-md border border-border p-2">
              <input
                aria-label={`Label for link ${index + 1}`}
                className={INPUT_CLASS}
                placeholder="Where it is"
                value={link.label}
                onChange={(event) => set(index, { label: event.target.value })}
              />
              <input
                aria-label={`Address for link ${index + 1}`}
                className={`${INPUT_CLASS} text-input`}
                inputMode="url"
                autoCapitalize="none"
                autoCorrect="off"
                placeholder="https://"
                value={link.url}
                onChange={(event) => set(index, { url: event.target.value })}
              />
              <div className="flex items-center gap-1">
                {/* Only when it is a real address: an `href` built from half a
                    typed URL goes somewhere nobody meant. */}
                {/^https?:\/\/\S+$/.test(link.url.trim()) ? (
                  <a
                    href={link.url.trim()}
                    target="_blank"
                    rel="noreferrer noopener"
                    className="inline-flex min-h-touch items-center rounded-md px-3 text-label text-accent"
                  >
                    Open
                  </a>
                ) : null}
                <button
                  type="button"
                  onClick={() => onChange(links.filter((_, position) => position !== index))}
                  className="min-h-touch rounded-md px-3 text-label text-critical"
                >
                  Remove
                </button>
              </div>
            </li>
          ))}
        </ul>
      ) : null}

      <Button
        size="sm"
        disabled={links.length >= MAX_LINKS}
        onClick={() => onChange([...links, { label: '', url: '' }])}
      >
        {links.length > 0 ? 'Add another link' : 'Add a link'}
      </Button>
    </div>
  )
}
