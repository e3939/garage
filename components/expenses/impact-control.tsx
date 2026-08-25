// Owns the disclosure state for the bucket, the vehicle and the switch.
'use client'

import Link from 'next/link'

import { BucketChips } from '@/components/expenses/bucket-chips'
import { BudgetImpactSwitch } from '@/components/expenses/budget-impact-switch'
import { Field, INPUT_CLASS } from '@/components/ui/field'
import { monthName } from '@/lib/dates-display'
import type { IsoDate } from '@/lib/dates'
import { BUCKET_LABEL, BUCKET_VAR, type ExpenseBucket, type VehicleOption } from '@/lib/expenses/types'

type ImpactControlProps = {
  bucket: ExpenseBucket
  countsTowardBudget: boolean
  /** The expense's own date. The month named is its month, never today's. */
  occurredOn: IsoDate
  vehicles: readonly VehicleOption[]
  vehicleId: string
  onBucket: (bucket: ExpenseBucket) => void
  onVehicle: (vehicleId: string) => void
  onCounts: (counts: boolean) => void
  open: boolean
  onOpenChange: (open: boolean) => void
}

/**
 * What this expense does to the month, in one line.
 *
 * The category already implies both the bucket and the budget impact, and it is
 * right nearly every time, so the default state of this section is a sentence
 * reporting the answer — "Kept out of August · Project" — rather than three
 * controls asking a question that has already been answered. Change opens the
 * controls, and they are the same controls with the same reach as before:
 * bucket, vehicle, and the switch.
 *
 * The vehicle dropdown lives inside this block rather than above it because
 * bucket and vehicle are one decision. Attaching a car moves the expense into a
 * car bucket and the empty garage is what pins it to Life; both of those are
 * stated at the chips, where they happen.
 */
export function ImpactControl({
  bucket,
  countsTowardBudget,
  occurredOn,
  vehicles,
  vehicleId,
  onBucket,
  onVehicle,
  onCounts,
  open,
  onOpenChange,
}: ImpactControlProps) {
  const month = monthName(occurredOn)
  const vehicle = vehicles.find((entry) => entry.id === vehicleId) ?? null
  const only = vehicles.length === 1 ? (vehicles[0] ?? null) : null

  const note =
    vehicles.length === 0
      ? 'No vehicle in the garage yet. Car buckets need one, so this stays life spend whatever the category says.'
      : vehicle !== null
        ? `Attached to ${vehicle.nickname}. Choosing Life removes it.`
        : only !== null
          ? `Choosing a car bucket attaches ${only.nickname}.`
          : 'Choosing a car bucket attaches a vehicle.'

  return (
    <div className="space-y-2">
      <p className="text-label text-ink-muted" id="expense-impact-label">
        Bucket and budget
      </p>

      <div className="rounded-md border border-border bg-surface">
        <button
          type="button"
          onClick={() => onOpenChange(!open)}
          aria-expanded={open}
          aria-describedby="expense-impact-label"
          className="flex min-h-touch w-full items-center justify-between gap-3 px-3 py-2 text-left"
        >
          <span className="text-body text-ink">
            {countsTowardBudget ? `Counts toward ${month}` : `Kept out of ${month}`}
            <span className="text-ink-faint">{' · '}</span>
            <span style={{ color: BUCKET_VAR[bucket] }}>{BUCKET_LABEL[bucket]}</span>
            {vehicle ? (
              <>
                <span className="text-ink-faint">{' · '}</span>
                <span className="text-ink-muted">{vehicle.nickname}</span>
              </>
            ) : null}
          </span>
          <span className="shrink-0 text-label text-accent">{open ? 'Done' : 'Change'}</span>
        </button>

        {open ? (
          <div className="space-y-5 border-t border-border px-3 py-4">
            <BucketChips
              value={bucket}
              onChange={onBucket}
              vehicleAttached={vehicle !== null}
              canAttachVehicle={vehicles.length > 0}
              note={note}
            />

            {vehicles.length === 0 ? (
              <p className="text-caption text-ink-muted">
                <Link href="/garage/new" className="text-accent underline underline-offset-2">
                  Add a vehicle
                </Link>{' '}
                and the two car buckets open up. This form closes if you do.
              </p>
            ) : null}

            {vehicles.length > 0 ? (
              <Field label="Vehicle" htmlFor="expense-vehicle">
                <select
                  id="expense-vehicle"
                  className={INPUT_CLASS}
                  value={vehicleId}
                  onChange={(event) => onVehicle(event.target.value)}
                >
                  <option value="">No vehicle</option>
                  {vehicles.map((entry) => (
                    <option key={entry.id} value={entry.id}>
                      {entry.nickname}
                    </option>
                  ))}
                </select>
              </Field>
            ) : null}

            <BudgetImpactSwitch
              checked={countsTowardBudget}
              occurredOn={occurredOn}
              onChange={onCounts}
            />
          </div>
        ) : null}
      </div>
    </div>
  )
}
