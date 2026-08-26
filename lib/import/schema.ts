/**
 * What the server will accept from an import.
 *
 * The browser did the reading, the mapping and the dry run, and none of that is
 * trusted here: the commit arrives as a plain list of expenses and a plain list
 * of categories, and both are re-parsed. An expense goes through
 * `expenseWriteSchema` — the same schema the quick-add sheet and the ledger's
 * edit form go through — so an import cannot create a row the app itself would
 * refuse to create, including the one rule zod holds that the database also
 * holds: a car bucket needs a car.
 */

import { z } from 'zod'

import { expenseWriteSchema } from '@/lib/expenses/schema'
import { IMPORT_ROW_LIMIT } from '@/lib/import/types'

const hexColour = z
  .string()
  .trim()
  .regex(/^#[0-9a-fA-F]{6}$/)
  .transform((value) => value.toUpperCase())

export const newCategorySchema = z.object({
  id: z.uuid(),
  name: z.string().trim().min(1, 'A category needs a name').max(60),
  icon: z.string().trim().min(1).max(60),
  colour_hex: hexColour,
  default_bucket: z.enum(['life', 'car_running', 'car_project']),
  default_counts_toward_budget: z.boolean(),
})

export const importCommitSchema = z.object({
  /** At most one new category per row, which is the only real ceiling there is. */
  categories: z.array(newCategorySchema).max(IMPORT_ROW_LIMIT),
  expenses: z
    .array(expenseWriteSchema)
    .min(1, 'There is nothing to import')
    .max(IMPORT_ROW_LIMIT, `An import is capped at ${IMPORT_ROW_LIMIT} rows at a time`),
})

export type ImportCommit = z.infer<typeof importCommitSchema>

/** The ids a dry run asks the ledger about. Capped for the same reason. */
export const existingIdsSchema = z.array(z.uuid()).max(IMPORT_ROW_LIMIT * 2)
