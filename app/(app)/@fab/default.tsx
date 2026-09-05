import { QuickAddFab } from '@/app/(app)/@fab/quick-add-fab'

/** Hard loads on a route with no page of its own still get the FAB. */
export default function DefaultFab() {
  return <QuickAddFab />
}
