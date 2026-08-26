'use server'

/**
 * The two things an import asks the server for.
 *
 * `existingExpenseIdsAction` is part of the dry run: a file this app exported
 * carries every row's id, and the summary can only say "already in the ledger"
 * if it knows which ones are. It is a read, and RLS makes it a read of your own
 * ledger and nobody else's.
 *
 * `commitImportAction` is the write, and it is one call to one function so that
 * it is one transaction. Either the whole file lands or none of it does — see
 * `import_expenses` in migration 0020, and the note there about why creating the
 * categories and inserting the expenses cannot be two requests.
 */

import { revalidatePath } from 'next/cache'

import { createClient } from '@/lib/supabase/server'
import { existingIdsSchema, importCommitSchema } from '@/lib/import/schema'

export type ImportResult =
  | { ok: true; imported: number; skipped: number; categoriesCreated: number }
  | { ok: false; error: string }

export type ExistingIdsResult =
  | { ok: true; ids: string[] }
  | { ok: false; error: string }

/** Postgres error text is not copy. These are the ones a person can reach. */
function describe(message: string): string {
  if (message.includes('unknown vehicle')) {
    return 'One of the rows points at a vehicle that is not in this garage. Nothing was imported.'
  }
  if (message.includes('unknown category')) {
    return 'One of the rows points at a category that no longer exists. Nothing was imported.'
  }
  if (message.includes('expenses_bucket_vehicle_check')) {
    return 'A car bucket needs a vehicle, and life spend cannot have one. Nothing was imported.'
  }
  if (message.includes('canceling statement')) {
    return 'The import took too long and was rolled back. Nothing was imported. Try a shorter file.'
  }
  return `Nothing was imported: ${message}`
}

/**
 * Which of these ids the ledger already holds.
 *
 * Asked in chunks, because the ids travel in the query string of a `in.()`
 * filter and a file of two thousand of them would build a URL no proxy will
 * accept.
 */
export async function existingExpenseIdsAction(raw: unknown): Promise<ExistingIdsResult> {
  const parsed = existingIdsSchema.safeParse(raw)
  if (!parsed.success) return { ok: false, error: 'Those are not row ids' }
  if (parsed.data.length === 0) return { ok: true, ids: [] }

  const supabase = await createClient()
  const found: string[] = []
  const CHUNK = 200

  for (let index = 0; index < parsed.data.length; index += CHUNK) {
    const chunk = parsed.data.slice(index, index + CHUNK)
    const { data, error } = await supabase.from('expenses').select('id').in('id', chunk)
    if (error) return { ok: false, error: error.message }
    for (const row of data ?? []) found.push(row.id)
  }

  return { ok: true, ids: found }
}

export async function commitImportAction(raw: unknown): Promise<ImportResult> {
  const parsed = importCommitSchema.safeParse(raw)
  if (!parsed.success) {
    const issue = parsed.error.issues[0]
    return { ok: false, error: issue?.message ?? 'That import is not valid' }
  }

  const supabase = await createClient()

  const { data, error } = await supabase.rpc('import_expenses', {
    p_categories: parsed.data.categories,
    p_expenses: parsed.data.expenses,
  })

  if (error) return { ok: false, error: describe(error.message) }

  const result = (data ?? {}) as {
    categories_created?: number
    expenses_imported?: number
    expenses_skipped?: number
  }

  // Everything moved: the ledger, both month figures, every budget arc, and any
  // vehicle whose odometer an imported reading pushed forward.
  revalidatePath('/today')
  revalidatePath('/ledger')
  revalidatePath('/money')
  revalidatePath('/garage', 'layout')
  revalidatePath('/settings/export')

  return {
    ok: true,
    imported: result.expenses_imported ?? 0,
    skipped: result.expenses_skipped ?? 0,
    categoriesCreated: result.categories_created ?? 0,
  }
}
