// The form is entirely interactive: parsing as you type, resolving the bucket,
// and handing the write to the optimistic queue.
'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import dynamic from 'next/dynamic'
import Link from 'next/link'
import { useForm } from 'react-hook-form'

import {
  createExpenseAction,
  updateExpenseAction,
  type ActionResult,
} from '@/app/(app)/expenses/actions'
import { AmortiseField } from '@/components/expenses/amortise-field'
import {
  clearExpenseDraft,
  readExpenseDraft,
  writeExpenseDraft,
} from '@/components/expenses/expense-draft'
import { CategoryChips } from '@/components/expenses/category-chips'
import { ImpactControl } from '@/components/expenses/impact-control'
import { useExpenseStore } from '@/components/expenses/expense-store'
import { AmountInput } from '@/components/ui/amount-input'
import { Button } from '@/components/ui/button'
import { Field, INPUT_CLASS } from '@/components/ui/field'
import { Money } from '@/components/ui/money'
import { resolveBucket, resolveCountsTowardBudget } from '@/lib/budget'
import { isIsoDate, type IsoDate } from '@/lib/dates'
import type { ExpenseWrite } from '@/lib/expenses/schema'
import { draftLedgerRow } from '@/lib/expenses/optimistic'
import type { CategoryOption, ExpenseBucket, LedgerRow, VehicleOption } from '@/lib/expenses/types'
import type { FundOffer } from '@/lib/funds/types'
import { formatAmount, parseAmount, parsedAmountHint } from '@/lib/money'
import type { AttachmentDraft, AttachmentView } from '@/lib/attachments/types'

/**
 * The photo field carries `browser-image-compression` and the Supabase browser
 * client behind it, and this form is mounted inside the quick-add sheet on every
 * route with a FAB. Loaded here it is a separate chunk that arrives when the
 * More disclosure opens, not weight on `/today` for somebody who never attaches
 * a photograph.
 */
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

/**
 * A create-mode form opened with some of the answers already known.
 *
 * The one caller today is "Mark installed" on the mod board, which knows the
 * amount (the estimate midpoint), the car, the bucket, the category and the mod
 * the expense pays for. Everything here is a starting value, not a lock: the
 * form is the same form and every field is still editable.
 */
export type ExpensePrefill = {
  /** Minor units, put back into the field the way it would have been typed. */
  amount?: number | null
  categoryId?: string
  vehicleId?: string
  bucket?: ExpenseBucket
  occurredOn?: IsoDate
  /** Written to `expenses.mod_plan_id`, which is what links plan to actual. */
  modPlanId?: string
}

export type ExpenseFormProps = {
  mode: 'create' | 'edit'
  initial?: LedgerRow | null
  /** Only read on a create. An edit starts from the row it is editing. */
  prefill?: ExpensePrefill
  categories: readonly CategoryOption[]
  vehicles: readonly VehicleOption[]
  currency: string
  locale: string
  /** Above this the form offers to spread the cost. Null means never offer. */
  amortiseThreshold: number | null
  today: IsoDate
  /** Whose storage folder uploads go into. From the session, never the client. */
  userId: string
  /** The photos already on this expense, signed. Empty on a new one. */
  initialAttachments?: readonly AttachmentView[]
  /**
   * A sinking fund saved up for exactly this, offered by the mark-installed
   * flow. Absent everywhere else — the ledger and quick add never show it, and
   * an edit never sees it, because setting the fund is what spends it.
   */
  fund?: FundOffer | null
  onDone: () => void
}

export type ExpenseFormValues = {
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
  currency: string,
  prefill?: ExpensePrefill,
): ExpenseFormValues {
  if (!initial) {
    return {
      amountText:
        prefill?.amount === undefined || prefill.amount === null
          ? ''
          : formatAmount(prefill.amount, currency, { locale }),
      categoryId: prefill?.categoryId ?? '',
      occurredOn: prefill?.occurredOn ?? today,
      vehicleId: prefill?.vehicleId ?? '',
      merchant: '',
      note: '',
      // Stated rather than inferred: the mod board knows this is project spend
      // whatever the category happens to default to.
      bucketOverride: prefill?.bucket ?? '',
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
  prefill,
  categories,
  vehicles,
  currency,
  locale,
  amortiseThreshold,
  today,
  userId,
  initialAttachments,
  fund = null,
  onDone,
}: ExpenseFormProps) {
  const store = useExpenseStore()
  const [formError, setFormError] = useState<string | null>(null)

  const [attachments, setAttachments] = useState<AttachmentDraft[]>(
    () => (initialAttachments ?? []).map(({ url: _url, ...draft }) => draft),
  )
  /** Signed URLs for the ones that came from the server. Fixed for this sheet. */
  const attachmentUrls = useMemo(() => {
    const map: Record<string, string | null> = {}
    for (const view of initialAttachments ?? []) map[view.id] = view.url
    return map
  }, [initialAttachments])

  /**
   * A create with nothing pre-filled opens on whatever was last typed and never
   * confirmed by the server. See `expense-draft.ts` — the point is that the
   * sheet closing, the request failing and the tab going away are three
   * different events and only the first of them is normal.
   *
   * Read once, in the initialiser, so it cannot fight what is being typed.
   */
  const [restored] = useState<ExpenseFormValues | null>(() =>
    mode === 'create' && !initial && !prefill ? readExpenseDraft() : null,
  )

  const { register, handleSubmit, watch, setValue, formState } = useForm<ExpenseFormValues>({
    defaultValues: restored ?? defaults(initial, categories, today, locale, currency, prefill),
  })

  // An expense that carries an override is one where the category's own answer
  // was not the right one, so its form opens with More down and the controls
  // already expanded: on that expense the one-line summary is not the whole
  // story. Everything else starts collapsed.
  const overridden = useMemo(() => {
    const start = defaults(initial, categories, today, locale, currency, prefill)
    return start.bucketOverride !== '' || start.countsOverride !== ''
  }, [initial, categories, today, locale, currency, prefill])

  /**
   * Offered, and offered switched on: a fund linked to this mod exists because
   * somebody put money aside for this exact purchase, so the useful default is
   * yes. Turning it off leaves the fund alone and the expense unflagged.
   */
  const [useFund, setUseFund] = useState(fund !== null)

  const [moreOpen, setMoreOpen] = useState(overridden)
  const [impactOpen, setImpactOpen] = useState(overridden)

  const values = watch()

  // Written as it is typed, and cleared by the server's confirmation rather than
  // by this form closing. An edit is never kept: it has a row on the server to
  // fall back on, and restoring a half-typed edit over a real expense would lose
  // more than it saved.
  useEffect(() => {
    if (mode !== 'create' || initial || prefill) return
    writeExpenseDraft(values)
  }, [mode, initial, prefill, values])

  const amountRef = useRef<HTMLInputElement | null>(null)
  const amountField = register('amountText')

  /** True while the attached vehicle is the form's doing rather than the user's. */
  const autoVehicle = useRef(false)

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

  /**
   * The vehicle's stored reading is the highest the app has ever seen, because
   * the trigger in migration 0012 only ever raises it. A lower number typed here
   * is saved exactly as typed — a reading someone actually took is data, and an
   * app that refuses it teaches them to lie to it — and flagged instead.
   */
  const typedOdometer = values.odometerKm.trim() === '' ? null : Number(values.odometerKm)
  const belowLastReading =
    vehicle !== null &&
    typedOdometer !== null &&
    Number.isFinite(typedOdometer) &&
    typedOdometer < vehicle.odometer_km

  const suggestSpread =
    amortiseThreshold !== null && amount !== null && Math.abs(amount) > amortiseThreshold

  function chooseBucket(next: ExpenseBucket) {
    autoVehicle.current = false
    setValue('bucketOverride', next)
    if (next === 'life') {
      setValue('vehicleId', '')
      setValue('odometerKm', '')
    } else if (!values.vehicleId && vehicles[0]) {
      setValue('vehicleId', vehicles[0].id)
    }
  }

  function chooseVehicle(next: string) {
    autoVehicle.current = false
    setValue('vehicleId', next)
    setValue('bucketOverride', '')
    if (next === '') setValue('odometerKm', '')
  }

  /**
   * A category whose default bucket is a car bucket is asking for the car, and
   * with one vehicle in the garage there is no ambiguity about which one — so it
   * gets attached rather than the bucket silently falling back to life. With two
   * vehicles the form does not guess; the note under the chips says what to do.
   *
   * The attachment is remembered as automatic, so moving on to a life category
   * takes it back off again. A vehicle the user picked by hand is never touched.
   */
  function chooseCategory(id: string) {
    setValue('categoryId', id)

    if (values.bucketOverride !== '') return
    const next = categories.find((entry) => entry.id === id) ?? null
    if (!next) return

    const only = vehicles.length === 1 ? vehicles[0] : undefined
    if (next.default_bucket !== 'life' && values.vehicleId === '' && only) {
      autoVehicle.current = true
      setValue('vehicleId', only.id)
    } else if (next.default_bucket === 'life' && autoVehicle.current) {
      autoVehicle.current = false
      setValue('vehicleId', '')
      setValue('odometerKm', '')
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
      // Only ever sent on a create from the mod board. Left off entirely
      // otherwise, so editing an expense in the ledger cannot unlink it from the
      // mod it paid for — see `linkedUuid` in `lib/expenses/schema.ts`.
      ...(prefill?.modPlanId ? { mod_plan_id: prefill.modPlanId } : {}),
      // Same rule, and for a sharper reason: the action writes the drawdown when
      // it sees this column on a create, so an edit that carried it would take
      // the money out of the fund a second time.
      ...(fund && useFund && mode === 'create' ? { fund_id: fund.fund_id } : {}),
    }

    const row = draftLedgerRow(write, {
      category,
      vehicle,
      createdAt: initial?.created_at ?? new Date().toISOString(),
      attachmentCount: attachments.length,
    })

    const perform = async (): Promise<ActionResult> => {
      const result =
        mode === 'create'
          ? await createExpenseAction(write, attachments)
          : await updateExpenseAction(write, attachments)

      // The draft goes when the server says the expense exists, and not before.
      // A failed save leaves it where it is, so the Retry in the toast is the
      // fast path back and reopening the sheet is the slow one.
      if (result.ok && mode === 'create') clearExpenseDraft()
      return result
    }

    store.run({ kind: 'save', row, previous: initial ?? null }, perform)
    onDone()
  })

  return (
    <form onSubmit={submit} className="flex min-h-0 flex-1 flex-col">
      <div className="min-h-0 flex-1 space-y-5 overflow-y-auto overflow-x-hidden px-4 py-4">
        <Field
          label="Amount"
          htmlFor="expense-amount"
          /* Only the live parsed value. The static "type 150k" line was 21px
             of the sheet's resting height and said the same thing the
             placeholder does; the echo docs/01-PRODUCT.md asks for appears the
             moment there is something to echo. */
          hint={hint}
          error={formError}
        >
          <AmountInput
            id="expense-amount"
            enterKeyHint="done"
            placeholder="0"
            className={`${INPUT_CLASS} font-mono text-odometer-lg`}
            currency={currency}
            locale={locale}
            value={values.amountText}
            onValueChange={(text) =>
              setValue('amountText', text, { shouldDirty: true, shouldValidate: true })
            }
            onBlur={amountField.onBlur}
            name={amountField.name}
            inputRef={(element) => {
              amountField.ref(element)
              amountRef.current = element
            }}
          />
        </Field>

        {fund ? (
          <div className="space-y-2 rounded-md border border-border bg-surface-sunken p-3">
            <label className="flex min-h-touch cursor-pointer items-center gap-3">
              <input
                type="checkbox"
                className="size-5 accent-accent"
                checked={useFund}
                onChange={(event) => setUseFund(event.target.checked)}
              />
              <span className="min-w-0 flex-1 text-body text-ink">
                {`Pay from the ${fund.name} fund`}
              </span>
            </label>
            <p className="text-caption text-ink-muted">
              <FundDrawdownLine
                fund={fund}
                amount={amount}
                enabled={useFund}
                locale={locale}
              />
            </p>
          </div>
        ) : null}

        {/* `merchant` is the column, but nobody types "merchant" into a form —
            they type what the thing was. It is already the ledger row's title
            whenever it is set, so promoting it costs no schema and makes the
            row read as something you wrote rather than a category name. Still
            optional: amount, category, save is untouched. */}
        <Field label="What was this" htmlFor="expense-merchant">
          <input
            id="expense-merchant"
            className={INPUT_CLASS}
            autoComplete="off"
            enterKeyHint="next"
            placeholder="Oil change, groceries, coilovers"
            {...register('merchant')}
          />
        </Field>

        <div className="space-y-2">
          <CategoryChips
            categories={categories}
            value={values.categoryId}
            onChange={chooseCategory}
          />
          {forcedToLife ? (
            <p className="text-caption text-ink-muted">
              {vehicles.length === 0
                ? 'No vehicle in the garage yet, so this logs as life spend.'
                : 'No vehicle attached, so this logs as life spend.'}{' '}
              {vehicles.length > 0 ? (
                <>
                  <button
                    type="button"
                    onClick={() => {
                      setMoreOpen(true)
                      setImpactOpen(true)
                    }}
                    className="text-accent underline underline-offset-2"
                  >
                    Attach one
                  </button>
                  .
                </>
              ) : (
                // Leaves the sheet, and anything typed into it. Said plainly
                // rather than discovered: the alternative is building the whole
                // vehicle form a second time inside this one, on every route
                // that carries the FAB.
                <>
                  <Link href="/garage/new" className="text-accent underline underline-offset-2">
                    Add one
                  </Link>{' '}
                  — this form closes if you do.
                </>
              )}
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

        <details
          className="rounded-md border border-border"
          open={moreOpen}
          onToggle={(event) => setMoreOpen(event.currentTarget.open)}
        >
          <summary className="min-h-touch cursor-pointer list-none px-3 py-3 text-label text-ink-muted marker:content-none">
            More
          </summary>

          {/* Order is what this expense means first and what it was second:
              bucket and budget impact decide which pile of money it came out of
              and whether August is judged on it. The date and the merchant are
              filing details. */}
          <div className="space-y-5 border-t border-border px-3 py-4">
            <ImpactControl
              bucket={bucket}
              countsTowardBudget={countsTowardBudget}
              occurredOn={occurredOn}
              vehicles={vehicles}
              vehicleId={values.vehicleId}
              onBucket={chooseBucket}
              onVehicle={chooseVehicle}
              onCounts={(next) => setValue('countsOverride', next ? 'yes' : 'no')}
              open={impactOpen}
              onOpenChange={setImpactOpen}
            />

            {suggestSpread ? null : (
              <AmortiseField
                months={values.amortizeMonths}
                onChange={(months) => setValue('amortizeMonths', months)}
                amount={amount}
                currency={currency}
                locale={locale}
                occurredOn={occurredOn}
              />
            )}

            <Field label="Date" htmlFor="expense-date">
              <input
                id="expense-date"
                type="date"
                className={`${INPUT_CLASS} font-mono`}
                {...register('occurredOn')}
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
                hint={
                  belowLastReading
                    ? `Lower than last reading (${vehicle.odometer_km.toLocaleString(locale)} km). Saved as typed.`
                    : `Last known reading ${vehicle.odometer_km.toLocaleString(locale)} km.`
                }
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

            {/* Mounted only once More is open, so the compression library is
                fetched by somebody who might actually use it. */}
            {moreOpen ? (
              <AttachmentField
                userId={userId}
                vehicleId={values.vehicleId || null}
                owner="expense"
                value={attachments}
                onChange={setAttachments}
                urls={attachmentUrls}
                context={
                  values.merchant.trim() || category?.name || 'this expense'
                }
              />
            ) : null}
          </div>
        </details>
      </div>

      {/* pt-2 rather than py-3: the button carries its own 44px target, so the
          12px above it was separating a rule from a control that does not need
          separating. The 4px reclaimed goes to the scrolling body above, which
          is where the sheet is actually short. The bottom keeps its 12px plus
          the home indicator. */}
      <div
        className="border-t border-border bg-surface px-4 pt-2"
        style={{ paddingBottom: 'calc(var(--space-3) + env(safe-area-inset-bottom))' }}
      >
        <Button type="submit" variant="primary" className="w-full" disabled={formState.isSubmitting}>
          {mode === 'create' ? 'Log expense' : 'Save changes'}
        </Button>
      </div>
    </form>
  )
}

/**
 * What saving this does to the fund, in one sentence.
 *
 * The drawdown is capped at the balance, here and in the server action, and the
 * action is the one that counts — it reads the balance itself rather than
 * trusting this number. A fund can be emptied; it cannot be pushed below zero.
 */
function FundDrawdownLine({
  fund,
  amount,
  enabled,
  locale,
}: {
  fund: FundOffer
  amount: number | null
  enabled: boolean
  locale: string
}) {
  const balance = (
    <Money amount={fund.balance} currency={fund.currency} locale={locale} size="label" />
  )

  if (!enabled) return <>{'Leaves '}{balance}{' where it is.'}</>

  if (amount === null || amount <= 0) {
    return <>{balance}{' in it.'}</>
  }

  const drawdown = Math.min(amount, fund.balance)

  return (
    <>
      {balance}
      {' in it. Saving takes '}
      <Money amount={drawdown} currency={fund.currency} locale={locale} size="label" />
      {drawdown < amount ? ' out — all of it — and the rest comes from somewhere else.' : ' out.'}
    </>
  )
}
