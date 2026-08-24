import Link from 'next/link'
import { Plus } from '@/components/icons'

/**
 * Fills the shell's FAB slot: the persistent brick action that opens quick add.
 *
 * Phase 2 replaces the link with the quick-add bottom sheet. Until then it goes
 * to the expense route so the target is real rather than a dead button.
 */
export function QuickAddFab() {
  return (
    <Link
      href="/ledger"
      className={[
        'fixed bottom-nav right-4 z-30 flex size-fab items-center justify-center',
        'rounded-full bg-accent text-accent-ink',
        'transition-transform duration-state ease-enter active:scale-[0.96]',
      ].join(' ')}
      style={{ marginBottom: 'calc(var(--space-4) + env(safe-area-inset-bottom))' }}
    >
      <Plus size={24} weight="bold" aria-hidden />
      <span className="sr-only">Log expense</span>
    </Link>
  )
}
