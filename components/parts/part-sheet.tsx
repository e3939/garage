// A form with a picker, an upload field and an optional expense in it.
'use client'

import dynamic from 'next/dynamic'
import { useMemo, useState } from 'react'
import { useForm } from 'react-hook-form'

import { createPartAction, deletePartAction, updatePartAction } from '@/app/(app)/parts/actions'
import { LinkedExpenseField } from '@/components/expenses/linked-expense-field'
import { Button } from '@/components/ui/button'
import { Chip } from '@/components/ui/chip'
import { Field, INPUT_CLASS } from '@/components/ui/field'
import { Money } from '@/components/ui/money'
import { useToast } from '@/components/ui/toast'
import type { AttachmentDraft, AttachmentView } from '@/lib/attachments/types'
import type { IsoDate } from '@/lib/dates'
import { buildLinkedExpense, defaultCategory } from '@/lib/expenses/linked'
import type { CategoryOption } from '@/lib/expenses/types'
import { parseAmount } from '@/lib/money'
import type { PartWrite } from '@/lib/parts/schema'
import type { ExpenseOption, ModOption, Part } from '@/lib/parts/types'
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

export type PartSheetProps = {
  mode: 'create' | 'edit'
  vehicleId: string
  userId: string
  initial?: Part | null
  initialAttachments?: readonly AttachmentView[]
  /** Expenses on this car a part can be created from. */
  expenses: readonly ExpenseOption[]
  mods: readonly ModOption[]
  categories: readonly CategoryOption[]
  icons: Record<string, ReactNode>
  currency: string
  locale: string
  today: IsoDate
  /** Dates in words for the expense picker, formatted on the server. */
  dateLabels: Record<string, string>
  onDone: () => void
}

type Values = {
  name: string
  brand: string
  partNumber: string
  installedOn: string
  warrantyUntil: string
  notes: string
}

/** Where the money for a part comes from: nowhere, an expense, or a new one. */
type Source = 'none' | 'existing' | 'new'

/**
 * A part, from scratch or from an expense that is already in the ledger.
 *
 * docs/01-PRODUCT.md, section F, asks for both routes, and they are the same
 * form with a different answer to one question: which expense paid for this.
 * Picking an existing one also picks up the mod that expense was for, because an
 * expense that already knows which mod it belongs to should not have to be told
 * again — and the mod is what the sale later nets against.
 */
export function PartSheet({
  mode,
  vehicleId,
  userId,
  initial,
  initialAttachments,
  expenses,
  mods,
  categories,
  icons,
  currency,
  locale,
  today,
  dateLabels,
  onDone,
}: PartSheetProps) {
  const toast = useToast()
  const [formError, setFormError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  const [source, setSource] = useState<Source>(initial?.expense_id ? 'existing' : 'none')
  const [expenseId, setExpenseId] = useState(initial?.expense_id ?? '')
  const [modId, setModId] = useState(initial?.mod_plan_id ?? '')
  const [amountText, setAmountText] = useState('')
  const [categoryId, setCategoryId] = useState(
    () => defaultCategory(categories, 'Mods & Parts', 'car_project')?.id ?? '',
  )

  const [attachments, setAttachments] = useState<AttachmentDraft[]>(
    () => (initialAttachments ?? []).map(({ url: _url, ...draft }) => draft),
  )
  const attachmentUrls = useMemo(() => {
    const map: Record<string, string | null> = {}
    for (const view of initialAttachments ?? []) map[view.id] = view.url
    return map
  }, [initialAttachments])

  const { register, handleSubmit, watch } = useForm<Values>({
    defaultValues: {
      name: initial?.name ?? '',
      brand: initial?.brand ?? '',
      partNumber: initial?.part_number ?? '',
      installedOn: initial?.installed_on ?? today,
      warrantyUntil: initial?.warranty_until ?? '',
      notes: initial?.notes ?? '',
    },
  })

  const values = watch()

  function chooseExpense(id: string) {
    setExpenseId(id)
    const picked = expenses.find((entry) => entry.id === id)
    // The expense already knows which mod it paid for. Do not ask twice.
    if (picked?.mod_plan_id) setModId(picked.mod_plan_id)
  }

  const submit = handleSubmit(async (form) => {
    setFormError(null)

    if (form.name.trim() === '') {
      setFormError('Name the part')
      return
    }

    const trimmed = (value: string) => (value.trim() === '' ? null : value.trim())

    const part: PartWrite = {
      id: initial?.id ?? crypto.randomUUID(),
      vehicle_id: vehicleId,
      name: form.name.trim(),
      brand: trimmed(form.brand),
      part_number: trimmed(form.partNumber),
      status: initial?.status ?? 'on_car',
      installed_on: (form.installedOn === '' ? null : form.installedOn) as IsoDate | null,
      removed_on: initial?.removed_on ?? null,
      warranty_until: (form.warrantyUntil === '' ? null : form.warrantyUntil) as IsoDate | null,
      expense_id: source === 'existing' ? expenseId || null : (initial?.expense_id ?? null),
      mod_plan_id: modId || null,
      notes: trimmed(form.notes),
    }

    const expense =
      mode === 'create' && source === 'new'
        ? buildLinkedExpense({
            amount: parseAmount(amountText, currency),
            currency,
            occurredOn: part.installed_on ?? today,
            vehicleId,
            category: categories.find((entry) => entry.id === categoryId) ?? null,
            merchant: part.brand,
            note: part.name,
            odometerKm: null,
            modPlanId: part.mod_plan_id,
          })
        : null

    setSaving(true)
    const result =
      mode === 'create'
        ? await createPartAction({ part, expense }, attachments)
        : await updatePartAction(part, attachments)
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
    const result = await deletePartAction(initial.id)
    setSaving(false)
    if (!result.ok) {
      setFormError(result.error)
      return
    }
    onDone()
    toast.show(`${initial.name} deleted`)
  }

  return (
    <form onSubmit={submit} className="flex min-h-0 flex-1 flex-col">
      <div className="min-h-0 flex-1 space-y-5 overflow-y-auto px-4 py-4">
        <Field label="What is it" htmlFor="part-name" error={formError}>
          <input
            id="part-name"
            className={INPUT_CLASS}
            autoComplete="off"
            placeholder="Front coilovers"
            {...register('name')}
          />
        </Field>

        <div className="grid grid-cols-2 gap-3">
          <Field label="Brand" htmlFor="part-brand">
            <input id="part-brand" className={INPUT_CLASS} autoComplete="off" {...register('brand')} />
          </Field>
          <Field label="Part number" htmlFor="part-number">
            <input
              id="part-number"
              className={`${INPUT_CLASS} font-mono`}
              autoComplete="off"
              autoCapitalize="characters"
              {...register('partNumber')}
            />
          </Field>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <Field label="Fitted on" htmlFor="part-installed">
            <input
              id="part-installed"
              type="date"
              className={`${INPUT_CLASS} font-mono`}
              {...register('installedOn')}
            />
          </Field>
          <Field label="Warranty until" htmlFor="part-warranty" hint="Leave blank if there is none.">
            <input
              id="part-warranty"
              type="date"
              className={`${INPUT_CLASS} font-mono`}
              {...register('warrantyUntil')}
            />
          </Field>
        </div>

        {mods.length > 0 ? (
          <Field label="Part of" htmlFor="part-mod" hint="A sale later nets against this mod.">
            <select
              id="part-mod"
              className={INPUT_CLASS}
              value={modId}
              onChange={(event) => setModId(event.target.value)}
            >
              <option value="">Nothing on the board</option>
              {mods.map((mod) => (
                <option key={mod.id} value={mod.id}>
                  {mod.title}
                </option>
              ))}
            </select>
          </Field>
        ) : null}

        {mode === 'create' ? (
          <div className="space-y-2">
            <p className="text-label text-ink-muted">What it cost</p>
            <div className="flex flex-wrap gap-2">
              <Chip selected={source === 'none'} onSelect={() => setSource('none')}>
                Not now
              </Chip>
              <Chip
                selected={source === 'existing'}
                onSelect={() => setSource('existing')}
                disabled={expenses.length === 0}
              >
                An expense I already logged
              </Chip>
              <Chip selected={source === 'new'} onSelect={() => setSource('new')}>
                A new expense
              </Chip>
            </div>

            {source === 'existing' ? (
              <select
                aria-label="Which expense bought this part"
                className={INPUT_CLASS}
                value={expenseId}
                onChange={(event) => chooseExpense(event.target.value)}
              >
                <option value="">Pick one</option>
                {expenses.map((expense) => (
                  <option key={expense.id} value={expense.id}>
                    {`${dateLabels[expense.occurred_on] ?? expense.occurred_on} · ${expense.label}`}
                  </option>
                ))}
              </select>
            ) : null}

            {source === 'new' ? (
              <LinkedExpenseField
                enabled
                onEnabled={() => setSource('none')}
                amountText={amountText}
                onAmountText={setAmountText}
                categoryId={categoryId}
                onCategoryId={setCategoryId}
                categories={categories}
                icons={icons}
                currency={currency}
                locale={locale}
                occurredOn={values.installedOn || today}
                label="Write it to the ledger"
              />
            ) : null}
          </div>
        ) : initial && initial.cost !== null ? (
          <p className="flex items-baseline justify-between gap-4 rounded-md border border-border bg-surface-sunken px-3 py-2">
            <span className="text-label text-ink-muted">Bought for</span>
            <Money amount={initial.cost} currency={initial.currency ?? currency} locale={locale} />
          </p>
        ) : null}

        <Field label="Notes" htmlFor="part-notes">
          <textarea
            id="part-notes"
            rows={2}
            className={`${INPUT_CLASS} py-2`}
            placeholder="Sizes, torque, what it replaced."
            {...register('notes')}
          />
        </Field>

        <AttachmentField
          userId={userId}
          vehicleId={vehicleId}
          owner="part"
          value={attachments}
          onChange={setAttachments}
          urls={attachmentUrls}
          context={values.name.trim() || 'this part'}
        />

        {mode === 'edit' && initial ? (
          <Button variant="danger" className="w-full" onClick={remove} disabled={saving}>
            Delete this part
          </Button>
        ) : null}
      </div>

      <div
        className="border-t border-border bg-surface px-4 py-3"
        style={{ paddingBottom: 'calc(var(--space-3) + env(safe-area-inset-bottom))' }}
      >
        <Button type="submit" variant="primary" className="w-full" disabled={saving}>
          {mode === 'create' ? 'Add part' : 'Save changes'}
        </Button>
      </div>
    </form>
  )
}
