import { restoreSnapshot } from '@/app/(app)/undo/actions'
import type { ActionResult } from '@/app/(app)/expenses/actions'
import type { Toast } from '@/components/ui/toast'

type Show = (message: string, action?: Toast['action']) => void

/**
 * The Undo half of a toast, for any write that came back with a snapshot.
 *
 * docs/03-DESIGN.md asks for Undo on every destructive or ambiguous write, and
 * this is what makes that a one-line obligation at each call site rather than a
 * restore action per entity. Returns `undefined` when there is nothing to undo,
 * which is exactly what `show()` wants for a toast with no action.
 *
 * A failed undo says so rather than disappearing: the row is gone either way,
 * and silence would leave somebody believing they had it back.
 */
export function undoFor(result: ActionResult, show: Show): Toast['action'] | undefined {
  if (!result.ok || !result.undo) return undefined

  const snapshot = result.undo

  return {
    label: 'Undo',
    run: () => {
      void restoreSnapshot(snapshot).then((outcome) => {
        if (!outcome.ok) show(outcome.error)
      })
    },
  }
}
