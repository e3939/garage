// Dispatches a window event, so it runs in the browser.
'use client'

import { requestQuickAdd } from '@/components/expenses/quick-add-signal'
import { preloadExpenseForm } from '@/components/expenses/expense-form-lazy'
import { Button } from '@/components/ui/button'

/**
 * "Log expense", for a screen that is empty and wants to say so with a button
 * rather than by pointing at the FAB. Opens the same sheet the FAB opens.
 */
export function QuickAddButton({ children = 'Log expense' }: { children?: string }) {
  return (
    <Button variant="primary" onPointerDown={preloadExpenseForm} onClick={requestQuickAdd}>
      {children}
    </Button>
  )
}
