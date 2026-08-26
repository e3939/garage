import { Skeleton, SkeletonLabel, StatSkeleton } from '@/components/ui/skeleton'

/**
 * The vehicle home: hero photograph, the switcher, the big figure, two smaller
 * ones side by side, then the build log. The hero reserves its aspect ratio so
 * the page does not jump when the photograph decodes.
 */
export default function VehicleLoading() {
  return (
    <div className="space-y-6">
      <SkeletonLabel />
      <Skeleton className="aspect-video w-full" />
      <Skeleton className="h-touch w-full" />
      <StatSkeleton emphasis="hero" />

      <div className="grid grid-cols-2 gap-3">
        <StatSkeleton />
        <StatSkeleton />
      </div>

      <div className="space-y-3">
        <Skeleton className="h-3 w-12" />
        <div className="space-y-px overflow-hidden rounded-md border border-border">
          {[0, 1, 2].map((row) => (
            <Skeleton key={row} className="h-nav w-full rounded-none" />
          ))}
        </div>
      </div>
    </div>
  )
}
