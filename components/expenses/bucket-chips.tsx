// Part of the expense form's client state.
'use client'

import { Chip } from '@/components/ui/chip'
import { BUCKETS, BUCKET_LABEL, BUCKET_VAR, type ExpenseBucket } from '@/lib/expenses/types'

type BucketChipsProps = {
  value: ExpenseBucket
  onChange: (bucket: ExpenseBucket) => void
  /** True once a vehicle is attached. A car bucket cannot exist without one. */
  vehicleAttached: boolean
  /** False when the garage is empty, which makes the car buckets unreachable. */
  canAttachVehicle: boolean
  /**
   * On an expense, bucket and vehicle move together. On a category's default
   * bucket there is no vehicle in the picture at all, so the coupling — and the
   * titles that explain it — is switched off.
   */
  coupled?: boolean
}

/**
 * Bucket and vehicle are the same decision wearing two hats: the database will
 * not store a car bucket without a car, or life spend with one. So picking a car
 * bucket here attaches a vehicle and picking life lets it go — the form does
 * that, and these titles say so before the tap rather than after.
 */
export function BucketChips({
  value,
  onChange,
  vehicleAttached,
  canAttachVehicle,
  coupled = true,
}: BucketChipsProps) {
  return (
    <div className="flex flex-wrap gap-2" role="group" aria-label="Bucket">
      {BUCKETS.map((bucket) => {
        const isCar = bucket !== 'life'
        const unavailable = coupled && isCar && !canAttachVehicle
        const title = !coupled
          ? undefined
          : unavailable
            ? 'Add a vehicle before logging car spend'
            : isCar && !vehicleAttached
              ? 'Also attaches a vehicle'
              : !isCar && vehicleAttached
                ? 'Also removes the vehicle'
                : undefined

        return (
          <Chip
            key={bucket}
            selected={value === bucket}
            accent={BUCKET_VAR[bucket]}
            onSelect={() => {
              if (!unavailable) onChange(bucket)
            }}
            className={unavailable ? 'opacity-40' : ''}
            title={title}
          >
            {BUCKET_LABEL[bucket]}
          </Chip>
        )
      })}
    </div>
  )
}
