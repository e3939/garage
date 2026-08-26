/**
 * Fund schemas. One zod schema per entity, shared client and server
 * (CLAUDE.md section 2).
 */

import { z } from 'zod'

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

const optionalUuid = z
  .union([z.uuid(), z.literal('')])
  .transform((value) => (value === '' ? null : value))
  .nullable()
  .default(null)

export const fundWriteSchema = z.object({
  id: z.uuid(),
  name: z.string().trim().min(1, 'Name the fund').max(120),
  vehicle_id: optionalUuid,
  mod_plan_id: optionalUuid,
  /** A target of nothing is never reached and never missed. */
  target_amount: z
    .number()
    .int('Target must be a whole number of minor units')
    .positive('Set a target worth saving for')
    .refine((value) => Number.isSafeInteger(value), 'Target is out of range'),
  /** Null is allowed: a fund with no rate simply has no projected date. */
  monthly_contribution: z
    .number()
    .int('Contribution must be a whole number of minor units')
    .positive('A contribution of nothing never gets there')
    .nullable()
    .default(null),
  currency: z.string().length(3).toUpperCase(),
})

export type FundWrite = z.infer<typeof fundWriteSchema>

/**
 * A contribution, or a drawdown with a minus in front of it. Zero is refused for
 * the same reason an expense of nothing is: it is a mistake, not a record.
 */
export const fundContributionSchema = z.object({
  id: z.uuid(),
  fund_id: z.uuid(),
  occurred_on: isoDate,
  amount: z
    .number()
    .int('Amount must be a whole number of minor units')
    .refine((value) => Number.isSafeInteger(value), 'Amount is out of range')
    .refine((value) => value !== 0, 'Enter an amount'),
  note: optionalText(500),
})

export type FundContributionWrite = z.infer<typeof fundContributionSchema>

export const fundIdSchema = z.uuid()

export const fundContributionIdSchema = z.uuid()

export const fundCloseSchema = z.object({
  id: z.uuid(),
  closed: z.boolean(),
})
