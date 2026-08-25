// Opens the sheet, so it owns open/closed state.
'use client'

import { useState } from 'react'

import { ExpenseForm, type ExpenseFormProps } from '@/components/expenses/expense-form'
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
 * the amount field takes focus on the way in.
 */
export function QuickAdd(props: QuickAddProps) {
  const [open, setOpen] = useState(false)

  return (
    <>
      <Fab onClick={() => setOpen(true)} label="Log expense">
        <Plus size={24} weight="bold" aria-hidden />
      </Fab>

      <Sheet open={open} onClose={() => setOpen(false)} title="Log expense">
        {open ? <ExpenseForm mode="create" onDone={() => setOpen(false)} {...props} /> : null}
      </Sheet>
    </>
  )
}
