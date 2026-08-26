// Opens the sheet, so it owns open/closed state.
'use client'

import { useState } from 'react'

import type { ExpenseFormProps } from '@/components/expenses/expense-form'
import { LazyExpenseForm, preloadExpenseForm } from '@/components/expenses/expense-form-lazy'
import { Fab } from '@/components/ui/fab'
import { Sheet } from '@/components/ui/sheet'
import { Plus } from '@/components/icons'

type QuickAddProps = Omit<ExpenseFormProps, 'mode' | 'initial' | 'onDone'>

/**
 * The FAB and the sheet it opens. Amount, category, Save — that is the whole
 * default flow, and everything else is behind the More disclosure inside the
 * form (docs/03-DESIGN.md, "Quick add").
 *
 * The form is mounted only while the sheet is open so each pass starts blank and
 * the amount field takes focus on the way in. It arrives as its own chunk, for
 * the reason in `expense-form-lazy.tsx`, and the fetch starts on `pointerdown`
 * rather than on the click — so it is in flight before the finger comes off the
 * glass and the sheet opens onto a form rather than onto a skeleton.
 */
export function QuickAdd(props: QuickAddProps) {
  const [open, setOpen] = useState(false)

  return (
    <>
      <Fab onClick={() => setOpen(true)} onPointerDown={preloadExpenseForm} label="Log expense">
        <Plus size={24} weight="bold" aria-hidden />
      </Fab>

      <Sheet open={open} onClose={() => setOpen(false)} title="Log expense">
        {open ? <LazyExpenseForm mode="create" onDone={() => setOpen(false)} {...props} /> : null}
      </Sheet>
    </>
  )
}
