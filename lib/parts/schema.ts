/**
 * The parts schemas. One zod schema per entity, shared client and server
 * (CLAUDE.md section 2).
 */

import { z } from 'zod'

import { expenseWriteSchema } from '@/lib/expenses/schema'
import { PART_STATUSES } from '@/lib/parts/types'

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

export const partWriteSchema = z.object({
  id: z.uuid(),
  vehicle_id: z.uuid(),
  name: z.string().trim().min(1, 'Name the part').max(120),
  brand: optionalText(80),
  part_number: optionalText(80),
  status: z.enum(PART_STATUSES),
  installed_on: isoDate.nullable().default(null),
  removed_on: isoDate.nullable().default(null),
  warranty_until: isoDate.nullable().default(null),
  /** The purchase. Set when the part was made from an expense already in the ledger. */
  expense_id: optionalUuid,
  mod_plan_id: optionalUuid,
  notes: optionalText(2000),
})

export type PartWrite = z.infer<typeof partWriteSchema>

export const partIdSchema = z.uuid()

/**
 * Taking a part off the car: keep it, sell it, or bin it.
 *
 * Selling carries the expense with it, and that expense is negative — the money
 * came back. It is built by the server rather than the client so its sign, its
 * bucket and the mod it points at cannot be argued with by a forged payload.
 */
export const partRemovalSchema = z
  .object({
    id: z.uuid(),
    outcome: z.enum(['shelf', 'sold', 'binned']),
    removed_on: isoDate,
    /** Minor units, positive. What it sold for; the sign is applied server-side. */
    sale_amount: z
      .number()
      .int('Amount must be a whole number of minor units')
      .min(0)
      .refine((value) => Number.isSafeInteger(value), 'Amount is out of range')
      .nullable()
      .default(null),
    sale_note: optionalText(160),
  })
  .refine(
    (value) => value.outcome !== 'sold' || (value.sale_amount !== null && value.sale_amount > 0),
    { message: 'What did it sell for?', path: ['sale_amount'] },
  )

export type PartRemoval = z.infer<typeof partRemovalSchema>

/** A part created from scratch, optionally with the expense that bought it. */
export const partCreateSchema = z.object({
  part: partWriteSchema,
  expense: expenseWriteSchema.nullable().default(null),
})
