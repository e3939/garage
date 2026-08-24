// Opens the sheet, so it owns open/closed state.
'use client'

import { useState } from 'react'

import { ExpenseForm, type ExpenseFormProps } from '@/components/expenses/expense-form'
import { Sheet } from '@/components/ui/sheet'
import { Plus } from '@/components/icons'

type QuickAddProps = Omit<ExpenseFormProps, 'mode' | 'initial' | 'onDone'>

/**
 * The FAB and the sheet it opens. Amount, category, Save — that is the whole
 * default flow, and everything else is behind the More disclosure inside the
 * form (docs/03-DESIGN.md, "Quick add").
 *
 * The form is mounted only while the sheet is open so each pass starts blank and
 * the amount field takes focus on the way in.
 */
export function QuickAdd(props: QuickAddProps) {
  const [open, setOpen] = useState(false)

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={[
          'fixed bottom-nav right-4 z-30 flex size-fab items-center justify-center',
          'rounded-full bg-accent text-accent-ink',
          'transition-transform duration-state ease-enter active:scale-[0.96]',
        ].join(' ')}
        style={{ marginBottom: 'calc(var(--space-4) + env(safe-area-inset-bottom))' }}
      >
        <Plus size={24} weight="bold" aria-hidden />
        <span className="sr-only">Log expense</span>
      </button>

      <Sheet open={open} onClose={() => setOpen(false)} title="Log expense">
        {open ? <ExpenseForm mode="create" onDone={() => setOpen(false)} {...props} /> : null}
      </Sheet>
    </>
  )
}
