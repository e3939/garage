import { Skeleton, SkeletonLabel } from '@/components/ui/skeleton'

/**
 * The ledger, before it has arrived. Day headings at 32px and rows at 64px —
 * the fixed heights from docs/03-DESIGN.md, so nothing on the screen moves when
 * the real rows land.
 */
export default function LedgerLoading() {
  return (
    <div className="space-y-4">
      <SkeletonLabel />
      <Skeleton className="h-touch w-full" />

      <div className="space-y-2">
        {[0, 1, 2].map((day) => (
          <div key={day} className="space-y-2">
            <Skeleton className="h-8 w-full" />
            {[0, 1, 2].map((row) => (
              <Skeleton key={row} className="h-nav w-full" />
            ))}
          </div>
        ))}
      </div>
    </div>
  )
}
