import { WarningCircle, ICON_UI } from '@/components/icons'
import {
  STORAGE_WARN_RATIO,
  formatBytes,
  photosRemaining,
  type StorageUsage,
} from '@/lib/gallery/types'

/**
 * How much of the plan's storage is gone.
 *
 * The gallery stores originals, so this is the number that decides how long the
 * feature keeps working. Showing it is not decoration: a quota you only meet by
 * hitting it is a quota that loses you a photo you wanted to keep.
 *
 * A bar rather than the tachometer arc from docs/03-DESIGN.md. The arc is the
 * budget's signature element and belongs to money; borrowing it here would make
 * two different things look like the same thing.
 */
export function StorageMeter({
  usage,
  detailed = false,
}: {
  usage: StorageUsage
  detailed?: boolean
}) {
  const percent = Math.min(100, Math.round(usage.ratio * 100))
  const warn = usage.ratio >= STORAGE_WARN_RATIO
  const free = Math.max(0, usage.quota - usage.bytes)

  return (
    <section className="space-y-2 rounded-md border border-border bg-surface p-4">
      <div className="flex items-baseline justify-between gap-4">
        <h2 className="text-label text-ink">Storage</h2>
        <p className="font-mono text-caption text-ink-muted">
          {formatBytes(usage.bytes)} of {formatBytes(usage.quota)}
        </p>
      </div>

      <div
        className="h-2 w-full overflow-hidden rounded-full bg-surface-sunken"
        role="img"
        aria-label={`${percent}% of storage used`}
      >
        <div
          className={`h-full rounded-full ${warn ? 'bg-critical' : 'bg-positive'}`}
          style={{ width: `${Math.max(percent, percent > 0 ? 2 : 0)}%` }}
        />
      </div>

      <p className="text-caption text-ink-muted">
        {warn ? (
          <span className="inline-flex items-center gap-1 text-critical">
            <WarningCircle {...ICON_UI} aria-hidden />
            Nearly full. Room for about {photosRemaining(free)} more photos.
          </span>
        ) : (
          `Room for about ${photosRemaining(free)} more photos at full size.`
        )}
      </p>

      {detailed && usage.buckets.length > 0 ? (
        <ul className="space-y-1 border-t border-border pt-2">
          {usage.buckets.map((bucket) => (
            <li key={bucket.bucket_id} className="flex items-baseline justify-between gap-4">
              <span className="text-caption text-ink-muted">{bucket.bucket_id}</span>
              <span className="font-mono text-caption text-ink-muted">
                {formatBytes(bucket.bytes)}
                <span className="text-ink-faint"> · {bucket.objects}</span>
              </span>
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  )
}
