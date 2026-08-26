type SkeletonProps = {
  /** Height, width and shape. Sized by the caller, because a skeleton that is
      not the shape of what replaces it is a layout shift with extra steps. */
  className?: string
}

/**
 * A block of nothing, in `--paper-sink`.
 *
 * docs/03-DESIGN.md: "Skeletons, not spinners. Skeletons are --paper-sink with
 * no shimmer." No shimmer is the whole point — a shimmer loops, and the motion
 * section of the same document says nothing loops. A recessed panel already
 * reads as "not filled in yet", which is exactly what the odometer bed reads as
 * everywhere else in the app.
 *
 * `aria-hidden`, and every `loading.tsx` that uses it carries one `sr-only`
 * "Loading" instead: a screen reader announcing eleven grey rectangles is worse
 * than one announcing nothing.
 */
export function Skeleton({ className = '' }: SkeletonProps) {
  return <div aria-hidden className={`rounded-md bg-surface-sunken ${className}`} />
}

/** The label every skeleton screen carries exactly once. */
export function SkeletonLabel({ children = 'Loading' }: { children?: string }) {
  return (
    <p role="status" className="sr-only">
      {children}
    </p>
  )
}

/**
 * A figure on the odometer strip, before it has one.
 *
 * Built out of the same padding and the same gaps as `<Stat>` rather than out of
 * a fixed height, because this fallback is in the first HTML the browser
 * receives and the real panel replaces it moments later. A skeleton that is not
 * the height of what lands on top of it is a layout shift on every load, and the
 * hero figure is the worst possible place to have one.
 */
export function StatSkeleton({ emphasis = 'panel' }: { emphasis?: 'hero' | 'panel' }) {
  const hero = emphasis === 'hero'

  return (
    <section
      aria-hidden
      className={['panel-sunken rounded-md', hero ? 'px-4 py-5' : 'px-3 py-3'].join(' ')}
    >
      <Skeleton className="h-4 w-24 opacity-60" />
      <div className={hero ? 'mt-2' : 'mt-1'}>
        <Skeleton className={hero ? 'h-8 w-48 opacity-60' : 'h-5 w-24 opacity-60'} />
      </div>
      {hero ? <Skeleton className="mt-2 h-3 w-full opacity-60" /> : null}
    </section>
  )
}
