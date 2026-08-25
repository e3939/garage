/**
 * The timeline-note schema. One zod schema per entity, shared client and server
 * (CLAUDE.md section 2); the client imports it as a type only, for the bundle
 * reason recorded in `lib/expenses/schema.ts`.
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

/**
 * A note is cost-free by definition — there is no amount and no currency on the
 * table, and that is the point of it (docs/01-PRODUCT.md: "free-text entries
 * with photos and no cost at all"). An entry that cost money is an expense.
 */
export const timelineNoteWriteSchema = z.object({
  id: z.uuid(),
  vehicle_id: z.uuid(),
  occurred_on: isoDate,
  title: z.string().trim().min(1, 'Give the entry a title').max(120),
  body: optionalText(4000),
  odometer_km: z.number().int().min(0).max(9_999_999).nullable().default(null),
})

export type TimelineNoteWrite = z.infer<typeof timelineNoteWriteSchema>

export const timelineNoteIdSchema = z.uuid()
