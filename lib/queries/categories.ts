import 'server-only'

import { cache } from 'react'

import { createClient } from '@/lib/supabase/server'
import type { CategoryOption } from '@/lib/expenses/types'

/**
 * Categories in chip order: most recently used first, then most used ever, then
 * the seeded sort order as a stable tiebreak.
 *
 * The ranking is `v_categories_ranked`, so "most used" is decided by Postgres
 * counting rows rather than by the browser sorting an array it had to download
 * first (CLAUDE.md section 3).
 *
 * Wrapped in React's `cache()` so the page and the shell's FAB slot — which
 * render as siblings and both need this — cost one round trip between them
 * rather than two. The memo is scoped to a single request, which is exactly
 * how long this answer is good for; see `lib/queries/session.ts`.
 */
export const fetchRankedCategories = cache(async function fetchRankedCategories(
  includeArchived = false,
): Promise<CategoryOption[]> {
  const supabase = await createClient()

  let query = supabase
    .from('v_categories_ranked')
    .select(
      'id, name, icon, colour_hex, default_bucket, default_counts_toward_budget, is_system, archived_at, sort_order, uses_recent, uses_all, last_used_on',
    )
    .order('uses_recent', { ascending: false })
    .order('uses_all', { ascending: false })
    .order('sort_order', { ascending: true, nullsFirst: false })
    .order('name', { ascending: true })

  if (!includeArchived) query = query.is('archived_at', null)

  const { data, error } = await query
  if (error) throw new Error(`v_categories_ranked failed: ${error.message}`)

  return (data ?? []).flatMap((row) => {
    // Every column of a view is nullable to the type generator. A category with
    // no id is not a category, so an unusable row is dropped rather than faked.
    if (!row.id || !row.name || !row.icon || !row.colour_hex || !row.default_bucket) return []
    return [
      {
        id: row.id,
        name: row.name,
        icon: row.icon,
        colour_hex: row.colour_hex,
        default_bucket: row.default_bucket,
        default_counts_toward_budget: row.default_counts_toward_budget ?? true,
        is_system: row.is_system ?? false,
        archived_at: row.archived_at,
        sort_order: row.sort_order,
        uses_recent: row.uses_recent ?? 0,
        uses_all: row.uses_all ?? 0,
        last_used_on: row.last_used_on,
      } satisfies CategoryOption,
    ]
  })
})

/** Settings orders by hand, not by usage: the list should not move under you. */
export async function fetchCategoriesForSettings(): Promise<CategoryOption[]> {
  const all = await fetchRankedCategories(true)
  return all.sort((a, b) => {
    const left = a.sort_order ?? Number.MAX_SAFE_INTEGER
    const right = b.sort_order ?? Number.MAX_SAFE_INTEGER
    if (left !== right) return left - right
    return a.name.localeCompare(b.name)
  })
}
