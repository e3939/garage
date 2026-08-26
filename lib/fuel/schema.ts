/**
 * The fuel-log schema. One zod schema per entity, shared client and server
 * (CLAUDE.md section 2).
 */

import { z } from 'zod'

import { expenseWriteSchema } from '@/lib/expenses/schema'

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/

const isoDate = z
  .string()
  .regex(ISO_DATE, 'Date must be YYYY-MM-DD')
  .refine((value) => !Number.isNaN(Date.parse(value)), 'That is not a real date')

/**
 * `numeric(8,3)` in the database, so three decimal places and nothing beyond.
 * Rounded rather than refused: a pump that printed 41.2345 is not a typo, it is
 * a pump, and the column simply does not have room for the last digit.
 */
const litres = z
  .number()
  .positive('Enter how many litres went in')
  .max(99_999)
  .transform((value) => Math.round(value * 1000) / 1000)

export const fuelLogSchema = z.object({
  id: z.uuid(),
  vehicle_id: z.uuid(),
  filled_on: isoDate,
  odometer_km: z.number().int('The odometer is a whole number of kilometres').min(0).max(9_999_999),
  litres,
  total_cost: z
    .number()
    .int('Amount must be a whole number of minor units')
    .min(0, 'A fill-up cannot cost less than nothing')
    .refine((value) => Number.isSafeInteger(value), 'Amount is out of range'),
  currency: z.string().length(3).toUpperCase(),
  is_full_tank: z.boolean().default(true),
  /** Breaks the consumption chain honestly rather than quietly averaging over it. */
  missed_previous: z.boolean().default(false),
  station: z
    .string()
    .trim()
    .max(160)
    .transform((value) => (value === '' ? null : value))
    .nullable()
    .default(null),
})

export type FuelLogWrite = z.infer<typeof fuelLogSchema>

/**
 * A fill-up, and the expense that paid for it, in one call.
 *
 * The same arrangement as marking a service done, and for the same reason: a
 * fill-up costs money, `fuel_logs.expense_id` is in the data model to say which
 * money, and a log whose fills never reach the ledger would leave every
 * cost-per-km figure in the app quietly missing its largest running cost.
 */
export const fuelLogWriteSchema = z.object({
  log: fuelLogSchema,
  expense: expenseWriteSchema.nullable().default(null),
})

export const fuelLogIdSchema = z.uuid()
