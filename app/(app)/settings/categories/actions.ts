'use server'

/**
 * Category management.
 *
 * There is no delete. Seeded categories are renameable but not deletable, and an
 * expense that points at a category should not lose it because the category
 * stopped being useful — so the only way out is `archived_at`, which hides it
 * from the chips and leaves history intact.
 */

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { categoryArchiveSchema, categoryWriteSchema } from '@/lib/expenses/schema'
import type { ActionResult } from '@/app/(app)/expenses/actions'

function revalidateCategoryScreens(): void {
  revalidatePath('/settings/categories')
  revalidatePath('/today')
  revalidatePath('/ledger')
}

async function currentUserId(): Promise<string | null> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  return user?.id ?? null
}

/** The unique index is on live names only, so this is the collision to explain. */
function describe(message: string): string {
  return message.includes('categories_user_name_live_key')
    ? 'A category with that name already exists'
    : message
}

export async function createCategoryAction(raw: unknown): Promise<ActionResult> {
  const parsed = categoryWriteSchema.safeParse(raw)
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? 'Not valid' }

  const userId = await currentUserId()
  if (!userId) return { ok: false, error: 'Sign in again to save this' }

  const supabase = await createClient()
  const { error } = await supabase.from('categories').insert({ ...parsed.data, user_id: userId })
  if (error) return { ok: false, error: describe(error.message) }

  revalidateCategoryScreens()
  return { ok: true }
}

export async function updateCategoryAction(raw: unknown): Promise<ActionResult> {
  const parsed = categoryWriteSchema.safeParse(raw)
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? 'Not valid' }

  const { id, ...columns } = parsed.data
  const supabase = await createClient()
  const { error } = await supabase.from('categories').update(columns).eq('id', id)
  if (error) return { ok: false, error: describe(error.message) }

  revalidateCategoryScreens()
  return { ok: true }
}

export async function setCategoryArchivedAction(raw: unknown): Promise<ActionResult> {
  const parsed = categoryArchiveSchema.safeParse(raw)
  if (!parsed.success) return { ok: false, error: 'Unknown category' }

  const supabase = await createClient()
  const { error } = await supabase
    .from('categories')
    .update({ archived_at: parsed.data.archived ? new Date().toISOString() : null })
    .eq('id', parsed.data.id)
  if (error) return { ok: false, error: describe(error.message) }

  revalidateCategoryScreens()
  return { ok: true }
}
