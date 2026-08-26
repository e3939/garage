// An amount field per draft, so the tray holds what has been typed into each.
'use client'

import { useState } from 'react'

import { confirmDraftAction, discardDraftAction } from '@/app/(app)/recurring/actions'
import { Button } from '@/components/ui/button'
import { INPUT_CLASS } from '@/components/ui/field'
import { useToast } from '@/components/ui/toast'
import { undoFor } from '@/components/ui/undo'
import { formatAmount, parseAmount, parsedAmountHint } from '@/lib/money'
import type { DraftExpense } from '@/lib/recurring/types'

export type DraftTrayProps = {
  drafts: readonly DraftExpense[]
  locale: string
  /** "1 Sep 2026" per draft, formatted on the server. */
  dateLabels: Readonly<Record<string, string>>
}

/**
 * Awaiting confirmation.
 *
 * docs/01-PRODUCT.md: recurring expenses "generate a draft on the due date and
 * sit in an 'Awaiting confirmation' tray until confirmed. Never silently
 * created." Everything about this component follows from that sentence. A draft
 * is invisible to `v_expense_impact`, to all three month totals, to the ledger,
 * to the timeline and to the budget arc; confirming is what makes it real, and
 * confirming is a tap a person makes.
 *
 * The amount is editable in place because a template is a guess about a bill
 * that had not arrived yet, and the electricity is never exactly what it was
 * last month. Nothing else is editable here: a draft that needs its category
 * changed is one to confirm and then edit in the ledger, where there is room.
 *
 * It sits at the top of `/today`, above the month's figure, because it is the
 * one thing on that screen that is asking rather than telling.
 */
export function DraftTray({ drafts, locale, dateLabels }: DraftTrayProps) {
  const toast = useToast()
  const [amounts, setAmounts] = useState<Record<string, string>>({})
  const [busy, setBusy] = useState<string | null>(null)

  if (drafts.length === 0) return null

  function textFor(draft: DraftExpense): string {
    return amounts[draft.id] ?? formatAmount(draft.amount, draft.currency, { locale })
  }

  async function confirm(draft: DraftExpense) {
    const amount = parseAmount(textFor(draft), draft.currency)
    if (amount === null || amount === 0) {
      toast.show('That amount is not a number I can read')
      return
    }

    setBusy(draft.id)
    const result = await confirmDraftAction({ id: draft.id, amount })
    setBusy(null)

    if (!result.ok) {
      toast.show(result.error)
      return
    }

    toast.show(`${draft.recurring_label ?? draft.merchant ?? 'Expense'} logged`)
  }

  async function discard(draft: DraftExpense) {
    setBusy(draft.id)
    const result = await discardDraftAction(draft.id)
    setBusy(null)

    if (!result.ok) {
      toast.show(result.error)
      return
    }

    toast.show(
      `${draft.recurring_label ?? draft.merchant ?? 'Draft'} dismissed`,
      undoFor(result, toast.show),
    )
  }

  return (
    <section className="space-y-3 rounded-md border border-border-strong bg-surface p-4">
      <div className="space-y-1">
        <h2 className="text-eyebrow font-display uppercase text-ink">Awaiting confirmation</h2>
        <p className="text-caption text-ink-muted">
          {drafts.length === 1
            ? 'One recurring expense has come due. Nothing counts until you confirm it.'
            : `${drafts.length} recurring expenses have come due. Nothing counts until you confirm them.`}
        </p>
      </div>

      <ul className="space-y-3">
        {drafts.map((draft) => {
          const text = textFor(draft)
          const parsed = parsedAmountHint(text, draft.currency, locale)
          const name = draft.recurring_label ?? draft.merchant ?? 'Expense'

          return (
            <li key={draft.id} className="space-y-2 border-t border-border pt-3 first:border-t-0 first:pt-0">
              <div className="flex items-baseline justify-between gap-3">
                <span className="min-w-0 flex-1 truncate text-body text-ink">{name}</span>
                <span className="shrink-0 text-caption text-ink-muted">
                  {dateLabels[draft.occurred_on] ?? draft.occurred_on}
                </span>
              </div>

              <div className="flex items-center gap-2">
                <input
                  inputMode="decimal"
                  autoComplete="off"
                  aria-label={`Amount for ${name}`}
                  className={`${INPUT_CLASS} font-mono`}
                  value={text}
                  onChange={(event) =>
                    setAmounts((previous) => ({ ...previous, [draft.id]: event.target.value }))
                  }
                />
                <Button
                  variant="primary"
                  size="sm"
                  className="shrink-0"
                  onClick={() => void confirm(draft)}
                  disabled={busy === draft.id}
                >
                  Confirm
                </Button>
              </div>

              <div className="flex items-baseline justify-between gap-3">
                <span className="min-w-0 flex-1 truncate text-caption text-ink-muted">
                  {parsed ?? 'Not a number I can read'}
                  {draft.category_name ? ` · ${draft.category_name}` : null}
                  {draft.counts_toward_budget ? null : ' · kept out of the budget'}
                </span>
                <button
                  type="button"
                  onClick={() => void discard(draft)}
                  disabled={busy === draft.id}
                  className="min-h-touch shrink-0 text-label text-ink-muted"
                >
                  Dismiss
                </button>
              </div>
            </li>
          )
        })}
      </ul>
    </section>
  )
}
