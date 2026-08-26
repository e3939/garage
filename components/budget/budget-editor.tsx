// A sheet with a figure and a cap per category, and two buttons that open it.
'use client'

import { useState, type ReactNode } from 'react'

import { copyBudgetsAction, saveBudgetsAction } from '@/app/(app)/money/actions'
import { Button } from '@/components/ui/button'
import { Field, INPUT_CLASS } from '@/components/ui/field'
import { Sheet } from '@/components/ui/sheet'
import { useToast } from '@/components/ui/toast'
import type { SaveBudgetsWrite } from '@/lib/budgets/schema'
import type { BudgetSnapshot } from '@/lib/budgets/types'
import type { IsoDate } from '@/lib/dates'
import type { CategoryOption } from '@/lib/expenses/types'
import { formatAmount, parseAmount, parsedAmountHint } from '@/lib/money'

export type BudgetEditorProps = {
  snapshot: BudgetSnapshot
  /** The month before this one, for the copy button. */
  previousMonth: IsoDate
  /** "July 2026" and "August 2026", formatted on the server. */
  previousMonthLabel: string
  monthLabel: string
  categories: readonly CategoryOption[]
  icons: Record<string, ReactNode>
  locale: string
}

/**
 * Setting the month's figure, and any caps under it.
 *
 * One sheet for both, and one write, because they are one decision: "twenty
 * million, of which at most three on eating out" is a sentence, not two. The
 * server action sends them to `save_budgets`, which replaces the month inside a
 * single transaction — so there is never a moment where the overall figure has
 * been cleared and the caps have not landed yet.
 *
 * Every category gets a field rather than an add-a-cap picker. Fifteen rows in a
 * sheet that scrolls is a list you read once and mostly leave blank; a picker is
 * a second decision ("which category?") before the first one ("how much?"), and
 * it hides the caps that already exist behind it.
 */
export function BudgetEditor({
  snapshot,
  previousMonth,
  previousMonthLabel,
  monthLabel,
  categories,
  icons,
  locale,
}: BudgetEditorProps) {
  const toast = useToast()
  const [open, setOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const { currency, month, overall, caps } = snapshot

  const [overallText, setOverallText] = useState(() =>
    overall.budget_amount === null ? '' : formatAmount(overall.budget_amount, currency, { locale }),
  )
  const [capText, setCapText] = useState<Record<string, string>>(() => {
    const start: Record<string, string> = {}
    for (const cap of caps) {
      start[cap.category_id] = formatAmount(cap.budget_amount, currency, { locale })
    }
    return start
  })

  function close() {
    setOpen(false)
    setError(null)
  }

  async function save() {
    setError(null)

    const trimmed = overallText.trim()
    const overallAmount = trimmed === '' ? null : parseAmount(trimmed, currency)
    if (trimmed !== '' && overallAmount === null) {
      setError('That budget is not a number I can read')
      return
    }

    const written: SaveBudgetsWrite['caps'] = []
    for (const category of categories) {
      const text = (capText[category.id] ?? '').trim()
      if (text === '') continue
      const amount = parseAmount(text, currency)
      if (amount === null) {
        setError(`The cap on ${category.name} is not a number I can read`)
        return
      }
      written.push({ category_id: category.id, amount })
    }

    setSaving(true)
    const result = await saveBudgetsAction({
      month,
      currency,
      overall: overallAmount,
      caps: written,
    })
    setSaving(false)

    if (!result.ok) {
      setError(result.error)
      return
    }

    close()
    toast.show(overallAmount === null && written.length === 0 ? 'Budget cleared' : 'Budget saved')
  }

  async function copyPrevious() {
    const result = await copyBudgetsAction({ from: previousMonth, to: month })
    if (!result.ok) {
      toast.show(result.error)
      return
    }
    toast.show(`Copied ${previousMonthLabel}`)
  }

  const hasBudget = overall.budget_amount !== null || caps.length > 0

  return (
    <>
      <div className="flex gap-2">
        <Button variant="secondary" className="flex-1" onClick={() => setOpen(true)}>
          {hasBudget ? 'Edit budget' : 'Set a budget'}
        </Button>
        {!hasBudget && snapshot.previousHasBudget ? (
          <Button variant="secondary" className="flex-1" onClick={copyPrevious}>
            {`Copy ${previousMonthLabel}`}
          </Button>
        ) : null}
      </div>

      <Sheet open={open} onClose={close} title={`Budget for ${monthLabel}`}>
        <div className="flex min-h-0 flex-1 flex-col">
          <div className="min-h-0 flex-1 space-y-5 overflow-y-auto px-4 py-4">
            <Field
              label="Monthly budget"
              htmlFor="budget-overall"
              hint={
                parsedAmountHint(overallText, currency, locale) ??
                'Leave blank for no budget this month.'
              }
              error={error}
            >
              <input
                id="budget-overall"
                inputMode="decimal"
                autoComplete="off"
                placeholder="0"
                className={`${INPUT_CLASS} font-mono`}
                value={overallText}
                onChange={(event) => setOverallText(event.target.value)}
              />
            </Field>

            <div className="space-y-2">
              <p className="text-label text-ink-muted">Caps</p>
              <p className="text-caption text-ink-muted">
                Optional. A category with no cap is not over or under anything — it still counts
                toward the figure above.
              </p>
              <ul className="overflow-hidden rounded-md border border-border">
                {categories.map((category) => {
                  const text = capText[category.id] ?? ''
                  const parsed = parsedAmountHint(text, currency, locale)
                  return (
                    <li key={category.id} className="border-b border-border last:border-b-0">
                      <div className="flex items-center gap-3 px-3 py-2">
                        <span
                          className="shrink-0"
                          style={{ color: category.colour_hex }}
                          aria-hidden
                        >
                          {icons[category.icon]}
                        </span>
                        <label
                          htmlFor={`cap-${category.id}`}
                          className="min-w-0 flex-1 truncate text-body text-ink"
                        >
                          {category.name}
                        </label>
                        <input
                          id={`cap-${category.id}`}
                          inputMode="decimal"
                          autoComplete="off"
                          placeholder="No cap"
                          aria-label={`Cap on ${category.name}`}
                          className={`${INPUT_CLASS} w-32 shrink-0 text-right font-mono`}
                          value={text}
                          onChange={(event) =>
                            setCapText((previous) => ({
                              ...previous,
                              [category.id]: event.target.value,
                            }))
                          }
                        />
                      </div>
                      {parsed ? (
                        <p className="px-3 pb-2 text-right text-caption text-ink-muted">{parsed}</p>
                      ) : null}
                    </li>
                  )
                })}
              </ul>
            </div>
          </div>

          <div
            className="border-t border-border bg-surface px-4 py-3"
            style={{ paddingBottom: 'calc(var(--space-3) + env(safe-area-inset-bottom))' }}
          >
            <Button variant="primary" className="w-full" onClick={save} disabled={saving}>
              Save budget
            </Button>
          </div>
        </div>
      </Sheet>
    </>
  )
}
