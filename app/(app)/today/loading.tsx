import { Skeleton, SkeletonLabel, StatSkeleton } from '@/components/ui/skeleton'

/**
 * Today: the switcher, the month's figure on its bed, and the latest rows.
 *
 * Every block here is built from the same spacing utilities as the thing it
 * stands in for, rather than from a guessed height. That is not tidiness: the
 * fallback is in the first HTML the browser gets and the real screen replaces
 * it a moment later, so a skeleton of the wrong height is a layout shift on
 * every single load.
 */
export default function TodayLoading() {
  return (
    <div className="space-y-6">
      <SkeletonLabel />
      <Skeleton className="h-touch w-full" />
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
