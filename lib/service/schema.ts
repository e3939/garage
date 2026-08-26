/**
 * The maintenance schemas. One zod schema per entity, shared client and server
 * (CLAUDE.md section 2); the client imports them as types only, for the bundle
 * reason recorded in `lib/expenses/schema.ts`.
 */

import { z } from 'zod'

import { expenseWriteSchema } from '@/lib/expenses/schema'

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/

const isoDate = z
  .string()
  .regex(ISO_DATE, 'Date must be YYYY-MM-DD')
  .refine((value) => !Number.isNaN(Date.parse(value)), 'That is not a real date')

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .transform((value) => (value === '' ? null : value))
    .nullable()
    .default(null)

const odometer = z.number().int().min(0).max(9_999_999).nullable().default(null)

/**
 * A schedule item. At least one interval, which is also a check constraint on
 * the table: an item with neither can never come due, so it is a note rather
 * than a schedule and there is somewhere else to put those.
 */
export const serviceScheduleSchema = z
  .object({
    id: z.uuid(),
    vehicle_id: z.uuid(),
    name: z.string().trim().min(1, 'Name the service item').max(120),
    interval_km: z
      .number()
      .int('Kilometres must be a whole number')
      .min(1, 'An interval of nothing never comes due')
      .max(1_000_000)
      .nullable()
      .default(null),
    interval_months: z
      .number()
      .int('Months must be a whole number')
      .min(1, 'An interval of nothing never comes due')
      .max(240)
      .nullable()
      .default(null),
    last_done_km: odometer,
    last_done_on: isoDate.nullable().default(null),
    notes: optionalText(2000),
  })
  .refine((value) => value.interval_km !== null || value.interval_months !== null, {
    message: 'Give it a distance, a time, or both',
    path: ['interval_km'],
  })

export type ServiceScheduleWrite = z.infer<typeof serviceScheduleSchema>

export const serviceScheduleArchiveSchema = z.object({
  id: z.uuid(),
  archived: z.boolean(),
})

/** One thing that was done to the car. `schedule_id` is null for one-off work. */
export const serviceRecordSchema = z.object({
  id: z.uuid(),
  vehicle_id: z.uuid(),
  schedule_id: z.uuid().nullable().default(null),
  name: z.string().trim().min(1, 'Name the work').max(120),
  performed_on: isoDate,
  odometer_km: odometer,
  workshop: optionalText(160),
  notes: optionalText(2000),
})

export type ServiceRecordWrite = z.infer<typeof serviceRecordSchema>

/**
 * Mark done: the record, and the expense that paid for it, in one call.
 *
 * docs/01-PRODUCT.md: "Completing a service creates a service record and
 * optionally an expense in one step." One flow, one confirmation — so the
 * expense is part of this payload rather than a second round trip the user has
 * to be told about, and the two land or fail together.
 */
export const markServiceDoneSchema = z.object({
  record: serviceRecordSchema,
  expense: expenseWriteSchema.nullable().default(null),
})

export const serviceRecordIdSchema = z.uuid()
