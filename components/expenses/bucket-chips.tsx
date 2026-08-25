// Part of the expense form's client state.
'use client'

import type { ReactNode } from 'react'

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
   * lines that explain it — is switched off.
   */
  coupled?: boolean
  /**
   * One line under the chips saying what the vehicle has to do with any of this.
   * It belongs here rather than under the vehicle dropdown: the chips are what
   * it explains, and a consequence three fields away from its cause is not an
   * explanation.
   */
  note?: ReactNode
}

/**
 * Bucket and vehicle are the same decision wearing two hats: the database will
 * not store a car bucket without a car, or life spend with one. So picking a car
 * bucket here attaches a vehicle and picking life lets it go — the form does
 * that, and the note under the chips says so before the tap rather than after.
 *
 * The dot is what makes the state readable without relying on the fill: hollow
 * when the bucket is merely available, solid when it is the one in force.
 */
export function BucketChips({
  value,
  onChange,
  vehicleAttached,
  canAttachVehicle,
  coupled = true,
  note,
}: BucketChipsProps) {
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-2" role="group" aria-label="Bucket">
        {BUCKETS.map((bucket) => {
          const isCar = bucket !== 'life'
          const unavailable = coupled && isCar && !canAttachVehicle
          const selected = value === bucket
          const colour = BUCKET_VAR[bucket]

          return (
            <Chip
              key={bucket}
              selected={selected}
              accent={colour}
              disabled={unavailable}
              onSelect={() => onChange(bucket)}
              title={
                !coupled || unavailable
                  ? undefined
                  : isCar && !vehicleAttached
                    ? 'Also attaches a vehicle'
                    : !isCar && vehicleAttached
                      ? 'Also removes the vehicle'
                      : undefined
              }
            >
              <span
                aria-hidden
                className="size-2 shrink-0 rounded-full border"
                style={{
                  borderColor: unavailable ? 'var(--text-faint)' : colour,
                  backgroundColor: selected && !unavailable ? colour : 'transparent',
                }}
              />
              {BUCKET_LABEL[bucket]}
              {unavailable ? <span className="sr-only">, unavailable</span> : null}
            </Chip>
          )
        })}
      </div>

      {note ? <p className="text-caption text-ink-muted">{note}</p> : null}
    </div>
  )
}
