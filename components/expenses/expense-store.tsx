// useOptimistic is the whole point of this file.
'use client'

import {
  createContext,
  startTransition,
  useContext,
  useMemo,
  useOptimistic,
  type ReactNode,
} from 'react'

import type { ActionResult } from '@/app/(app)/expenses/actions'
import { useToast } from '@/components/ui/toast'
import type { PendingOp } from '@/lib/expenses/optimistic'

/** Stable identity: a fresh array every render would restart the reducer. */
const NOTHING_PENDING: PendingOp[] = []

type ExpenseStore = {
  /** Writes that have been shown but not yet confirmed by the server. */
  pending: readonly PendingOp[]
  /**
   * Show the write, then perform it. The optimistic row is dropped when the
   * transition settles, by which point the action's revalidation has already
   * replaced the server data underneath it.
   */
  run: (op: PendingOp, perform: () => Promise<ActionResult>, undo?: UndoOffer) => void
}

export type UndoOffer = {
  message: string
  label: string
  run: () => void
}

const StoreContext = createContext<ExpenseStore | null>(null)

export function useExpenseStore(): ExpenseStore {
  const store = useContext(StoreContext)
  if (!store) throw new Error('useExpenseStore must be used inside <ExpenseStoreProvider>')
  return store
}

/**
 * One optimistic queue for the whole authenticated shell.
 *
 * It lives in the layout rather than in the ledger because the quick-add sheet
 * hangs off the FAB slot, which is a sibling of the page: an expense added there
 * has to land in the ledger and in the month total at the same moment, and a
 * queue held by either of those two could not do that.
 */
export function ExpenseStoreProvider({ children }: { children: ReactNode }) {
  const [pending, enqueue] = useOptimistic<PendingOp[], PendingOp>(
    NOTHING_PENDING,
    (queue, op) => [...queue, op],
  )
  const { show } = useToast()

  /**
   * Named so it can offer itself as the Retry.
   *
   * A write that does not reach the server is the failure this app is most
   * likely to meet — a phone in a car park, a lift, a tunnel — and it used to
   * end with a toast naming an exception and the typed expense gone. Now the
   * toast offers to send it again, and the closure it re-runs still holds the
   * whole write and its photographs, so a retry costs one tap and no retyping.
   *
   * A thrown error is treated as a failure rather than allowed to escape.
   * `fetch` rejects on a dropped connection, and an unhandled rejection inside a
   * transition takes the screen to the error boundary — which is a heavy answer
   * to "the network blinked" and loses the form as well.
   */
  const run = useMemo<ExpenseStore['run']>(() => {
    return function attempt(op, perform, undo) {
      startTransition(async () => {
        enqueue(op)

        let result: ActionResult
        try {
          result = await perform()
        } catch {
          result = { ok: false, error: 'That did not reach the server' }
        }

        if (result.ok) {
          if (undo) show(undo.message, { label: undo.label, run: undo.run })
        } else {
          show(result.error, { label: 'Retry', run: () => attempt(op, perform, undo) })
        }
      })
    }
  }, [enqueue, show])

  const value = useMemo<ExpenseStore>(() => ({ pending, run }), [pending, run])

  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>
}
