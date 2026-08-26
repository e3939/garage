import { Skeleton, SkeletonLabel, StatSkeleton } from '@/components/ui/skeleton'

/**
 * The shape of a screen before it has arrived.
 *
 * One boundary for the whole authenticated shell, so the header, the bottom bar
 * and the FAB stay put and only the column between them is replaced — which is
 * both what a native app does and what keeps a navigation feeling instant on a
 * phone that is waiting on a database.
 *
 * Routes whose shape is nothing like this one carry their own.
 */
export default function AppLoading() {
  return (
    <div className="space-y-6">
      <SkeletonLabel />
      <StatSkeleton emphasis="hero" />

      <div className="space-y-3">
        <Skeleton className="h-3 w-12" />
        <div className="space-y-px overflow-hidden rounded-md border border-border">
          {[0, 1, 2, 3].map((row) => (
            <Skeleton key={row} className="h-nav w-full rounded-none" />
          ))}
        </div>
      </div>
    </div>
  )
}
