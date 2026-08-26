/**
 * Budget schemas. One zod schema per entity, shared client and server
 * (CLAUDE.md section 2).
 */

import { z } from 'zod'

const MONTH_START = /^\d{4}-\d{2}-01$/

/**
 * A budget's month is always the first of one, which is also a check constraint
 * on the table. The screen only ever produces a month start, so anything else
 * arriving here is a hand-built request rather than a user mistake.
 */
const monthStart = z
  .string()
  .regex(MONTH_START, 'A budget is set for a whole month')
  .refine((value) => !Number.isNaN(Date.parse(value)), 'That is not a real month')

/**
 * A budget of nothing is not a budget, and a negative one is not a thing at all.
 * Removing a budget is done by clearing the field, which sends null.
 */
const budgetAmount = z
  .number()
  .int('Amount must be a whole number of minor units')
  .positive('A budget of nothing is not a budget')
  .refine((value) => Number.isSafeInteger(value), 'Amount is out of range')

export const saveBudgetsSchema = z.object({
  month: monthStart,
  currency: z.string().length(3).toUpperCase(),
  /** Null clears the overall budget for the month. */
  overall: budgetAmount.nullable().default(null),
  caps: z
    .array(
      z.object({
        category_id: z.uuid(),
        /** Null means this category has no cap. It is dropped, not stored as zero. */
        amount: budgetAmount.nullable().default(null),
      }),
    )
    .max(200)
    .default([]),
})

export type SaveBudgetsWrite = z.infer<typeof saveBudgetsSchema>

export const copyBudgetsSchema = z.object({
  from: monthStart,
  to: monthStart,
})
