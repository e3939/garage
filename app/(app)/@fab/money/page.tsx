import { QuickAddFab } from '@/app/(app)/@fab/quick-add-fab'

/**
 * The FAB for this destination. Explicit rather than inherited from `default`,
 * because a slot with nothing to match keeps its last state across a
 * client-side navigation. See `quick-add-fab.tsx`.
 */
export default function Fab() {
  return <QuickAddFab />
}
