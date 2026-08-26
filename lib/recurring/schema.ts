/**
 * Recurring-template schemas. One zod schema per entity, shared client and
 * server (CLAUDE.md section 2).
 */

import { z } from 'zod'

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/

const isoDate = z
  .string()
  .regex(ISO_DATE, 'Date must be YYYY-MM-DD')
  .refine((value) => !Number.isNaN(Date.parse(value)), 'That is not a real date')

const optionalUuid = z
  .union([z.uuid(), z.literal('')])
  .transform((value) => (value === '' ? null : value))
  .nullable()
  .default(null)

/**
 * A template's amount is required even though the column is nullable.
 *
 * The generator refuses to write an expense of nothing, so a template without an
 * amount is a row that quietly never fires. If the amount genuinely varies —
 * a utility bill — the tray is where it gets corrected: the draft arrives at the
 * template's figure and the amount is editable before Confirm.
 */
const templateAmount = z
  .number()
  .int('Amount must be a whole number of minor units')
  .refine((value) => Number.isSafeInteger(value), 'Amount is out of range')
  .refine((value) => value !== 0, 'Enter an amount')

export const recurringWriteSchema = z
  .object({
    id: z.uuid(),
    label: z.string().trim().min(1, 'Name what this is').max(120),
    amount: templateAmount,
    currency: z.string().length(3).toUpperCase(),
    category_id: optionalUuid,
    vehicle_id: optionalUuid,
    /** Resolved by the form through `lib/budget.ts`, exactly as an expense is. */
    bucket: z.enum(['life', 'car_running', 'car_project']),
    counts_toward_budget: z.boolean(),
    cadence: z.enum(['monthly', 'quarterly', 'yearly']),
    day_of_month: z
      .number()
      .int()
      .min(1)
      .max(31)
      .nullable()
      .default(null),
    month_of_year: z
      .number()
      .int()
      .min(1)
      .max(12)
      .nullable()
      .default(null),
    next_due: isoDate,
    active: z.boolean().default(true),
  })
  .refine(
    (value) => (value.bucket === 'life' ? value.vehicle_id === null : value.vehicle_id !== null),
    {
      message: 'A car bucket needs a vehicle, and life spend cannot have one',
      path: ['bucket'],
    },
  )

export type RecurringWrite = z.infer<typeof recurringWriteSchema>

export const recurringIdSchema = z.uuid()

export const recurringActiveSchema = z.object({
  id: z.uuid(),
  active: z.boolean(),
})

/**
 * Confirming a draft. The amount is editable in the tray — a template is a
 * guess about a bill that has not arrived yet — and nothing else is, because a
 * draft that needed a category changed is a draft that should be confirmed and
 * then edited in the ledger like any other expense.
 */
export const confirmDraftSchema = z.object({
  id: z.uuid(),
  amount: z
    .number()
    .int('Amount must be a whole number of minor units')
    .refine((value) => Number.isSafeInteger(value), 'Amount is out of range')
    .refine((value) => value !== 0, 'Enter an amount'),
})

export const draftIdSchema = z.uuid()
