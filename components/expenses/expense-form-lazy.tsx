// A dynamic import needs a client boundary to live behind.
'use client'

import dynamic from 'next/dynamic'

/**
 * The one lazy handle on the expense form, shared by every screen that opens it.
 *
 * **Why the form is not statically imported anywhere.** `/today` and `/ledger`
 * each render the ledger list *and* the quick-add FAB, which are two separate
 * client entry graphs. With the form imported directly into both, Turbopack
 * emitted it into two initial chunks and those routes downloaded the same 8.4KB
 * gzipped twice. That is not a deferral question, it is waste: the same code,
 * paid for twice, on the two routes that can least afford it. Behind one dynamic
 * handle there is exactly one chunk, and it is shared by the FAB, the ledger's
 * edit sheet and the mod board's mark-installed flow alike.
 *
 * It happens to defer the bytes as well, which is why `/garage/[vehicleId]` —
 * over the route ceiling since Phase 5 and named in AUTOPILOT-NOTES.md as the
 * one screen no change to this codebase could bring under it — is now well
 * inside it.
 *
 * **Why that does not cost a tap.** `preloadExpenseForm` starts the fetch on
 * `pointerdown`, so it is already in flight while the finger is still on the
 * glass and the sheet's own chrome — which is static — is what opens. The
 * skeleton below is what shows if the network is slower than the thumb.
 */
export const LazyExpenseForm = dynamic(
  () => import('@/components/expenses/expense-form').then((module) => module.ExpenseForm),
  {
    ssr: false,
    loading: () => <div className="min-h-0 flex-1 bg-surface-sunken" />,
  },
)

/**
 * Start fetching the chunk before it is needed. Idempotent: the module registry
 * caches the promise, so calling it on every pointerdown costs one lookup.
 */
export function preloadExpenseForm(): void {
  void import('@/components/expenses/expense-form')
}
