import 'server-only'

import { createClient } from '@/lib/supabase/server'
import { signAttachments } from '@/lib/storage/signed-url'
import { fetchAttachments } from '@/lib/attachments/server'
import type { AttachmentDraft, AttachmentView } from '@/lib/attachments/types'
import type { DependencyEdges } from '@/lib/mods/graph'
import {
  BOARD_STATUSES,
  EMPTY_TOTALS,
  isBoardStatus,
  type ModBoard,
  type ModCard,
  type ModDependency,
  type ModLink,
  type ModTotals,
} from '@/lib/mods/types'

/** The RPC returns jsonb columns; these put a type back on them without trusting one. */
function links(raw: unknown): ModLink[] {
  if (!Array.isArray(raw)) return []
  return raw.filter(
    (entry): entry is ModLink =>
      typeof entry === 'object' &&
      entry !== null &&
      typeof (entry as ModLink).label === 'string' &&
      typeof (entry as ModLink).url === 'string',
  )
}

function dependencies(raw: unknown): ModDependency[] {
  if (!Array.isArray(raw)) return []
  return raw as ModDependency[]
}

function photos(raw: unknown): AttachmentDraft[] {
  if (!Array.isArray(raw)) return []
  return raw as AttachmentDraft[]
}

type RawCard = Omit<ModCard, 'links' | 'depends_on' | 'photos'> & {
  links: unknown
  depends_on: unknown
  photos: unknown
}

/**
 * A vehicle's whole board, with every inspiration photo on it already signed.
 *
 * Two round trips: `mod_board` brings the cards, their dependencies and their
 * attachment rows together, and `signAttachments` signs the lot in one request
 * per bucket. The board is not paged — a plan is a list of wants, not a log.
 */
export async function fetchModBoard(vehicleId: string, currency: string): Promise<ModBoard> {
  const supabase = await createClient()

  const [board, totals] = await Promise.all([
    supabase.rpc('mod_board', { p_vehicle_id: vehicleId }),
    supabase
      .from('v_mod_board_totals')
      .select(
        'status, mods, estimate_total, estimate_min_total, estimate_max_total, actual_total, without_estimate',
      )
      .eq('vehicle_id', vehicleId)
      .eq('currency', currency),
  ])

  if (board.error) throw new Error(`mod_board failed: ${board.error.message}`)
  if (totals.error) throw new Error(`v_mod_board_totals failed: ${totals.error.message}`)

  const rows = (board.data ?? []) as unknown as RawCard[]

  const flat = rows.flatMap((row) => photos(row.photos))
  const signed = await signAttachments(flat)
  const byId = new Map<string, AttachmentView>()
  for (const view of signed) byId.set(view.id, view)

  const cards: ModCard[] = rows.map((row) => ({
    ...row,
    links: links(row.links),
    depends_on: dependencies(row.depends_on),
    photos: photos(row.photos)
      .map((photo) => byId.get(photo.id))
      .filter((photo): photo is AttachmentView => Boolean(photo)),
  }))

  return { cards, totals: totalsFrom(totals.data), currency }
}

type RawTotals = {
  status: string | null
  mods: number | null
  estimate_total: number | null
  estimate_min_total: number | null
  estimate_max_total: number | null
  actual_total: number | null
  without_estimate: number | null
}

/**
 * The build sheet, keyed by column plus one entry for the whole board. A column
 * with nothing in it gets a row of zeroes rather than being absent, so the
 * header renders "0 · —" instead of nothing at all.
 */
function totalsFrom(rows: RawTotals[] | null): ModBoard['totals'] {
  const empty = () => ({ ...EMPTY_TOTALS })
  const totals = {
    ...(Object.fromEntries(BOARD_STATUSES.map((status) => [status, empty()])) as Record<
      (typeof BOARD_STATUSES)[number],
      ModTotals
    >),
    whole: empty(),
  }

  for (const row of rows ?? []) {
    const entry: ModTotals = {
      status: row.status === null ? null : (row.status as ModTotals['status']),
      mods: row.mods ?? 0,
      estimate_total: row.estimate_total ?? 0,
      estimate_min_total: row.estimate_min_total ?? 0,
      estimate_max_total: row.estimate_max_total ?? 0,
      actual_total: row.actual_total ?? 0,
      without_estimate: row.without_estimate ?? 0,
    }

    if (row.status === null) {
      totals.whole = entry
    } else if (isBoardStatus(row.status)) {
      totals[row.status] = entry
    }
  }

  return totals
}

/**
 * The whole board's one-line summary, for the link to it on the vehicle page.
 *
 * The rollup row of `v_mod_board_totals` — the one with a null status — so this
 * is a single row rather than the board, its photographs and its dependencies.
 */
export async function fetchBuildSheetTotal(
  vehicleId: string,
  currency: string,
): Promise<ModTotals> {
  const supabase = await createClient()

  const { data, error } = await supabase
    .from('v_mod_board_totals')
    .select(
      'status, mods, estimate_total, estimate_min_total, estimate_max_total, actual_total, without_estimate',
    )
    .eq('vehicle_id', vehicleId)
    .eq('currency', currency)
    .is('status', null)
    .maybeSingle()

  if (error) throw new Error(`v_mod_board_totals failed: ${error.message}`)
  if (!data) return { ...EMPTY_TOTALS }

  return {
    status: null,
    mods: data.mods ?? 0,
    estimate_total: data.estimate_total ?? 0,
    estimate_min_total: data.estimate_min_total ?? 0,
    estimate_max_total: data.estimate_max_total ?? 0,
    actual_total: data.actual_total ?? 0,
    without_estimate: data.without_estimate ?? 0,
  }
}

/**
 * The dependency graph of one vehicle, for the cycle check in the server action.
 *
 * Read as edges rather than as a recursive query because the check has to run
 * against the graph *as it would be after the write*, and it has to be able to
 * name the loop it found. See `lib/mods/graph.ts`.
 */
export async function fetchDependencyGraph(vehicleId: string): Promise<{
  edges: DependencyEdges
  titles: Map<string, string>
}> {
  const supabase = await createClient()

  const [mods, deps] = await Promise.all([
    supabase
      .from('mod_plans')
      .select('id, title')
      .eq('vehicle_id', vehicleId)
      .is('archived_at', null),
    supabase.from('mod_dependencies').select('mod_plan_id, depends_on_id'),
  ])

  if (mods.error) throw new Error(`mod_plans failed: ${mods.error.message}`)
  if (deps.error) throw new Error(`mod_dependencies failed: ${deps.error.message}`)

  const titles = new Map<string, string>()
  for (const mod of mods.data ?? []) titles.set(mod.id, mod.title)

  const edges = new Map<string, string[]>()
  for (const edge of deps.data ?? []) {
    // Dependencies on other vehicles cannot exist through the UI, and one that
    // somehow did would still be irrelevant to this board's loops.
    if (!titles.has(edge.mod_plan_id) || !titles.has(edge.depends_on_id)) continue
    const existing = edges.get(edge.mod_plan_id) ?? []
    existing.push(edge.depends_on_id)
    edges.set(edge.mod_plan_id, existing)
  }

  return { edges, titles }
}

/** One mod's photos, signed, for the sheet that edits it. */
export async function fetchModAttachments(modId: string): Promise<AttachmentView[]> {
  return signAttachments(await fetchAttachments('mod_plan', modId))
}

/**
 * Every inspiration photo pinned to a mod on this vehicle, newest mod first.
 *
 * This is what the before/after slider picks from: docs/01-PRODUCT.md calls it
 * "the motivation feature", and the thing being motivated is a photograph of
 * what the car could look like held against a photograph of what it does.
 */
export async function fetchInspirationPhotos(vehicleId: string): Promise<
  (AttachmentView & { mod_title: string })[]
> {
  const supabase = await createClient()

  const { data, error } = await supabase
    .from('attachments')
    .select(
      'id, storage_path, bucket_name, kind, width, height, bytes, caption, sort_order, mod_plans!inner(title, vehicle_id, archived_at)',
    )
    .eq('mod_plans.vehicle_id', vehicleId)
    .is('mod_plans.archived_at', null)
    .order('created_at', { ascending: false })
    .limit(24)

  if (error) throw new Error(`attachments failed: ${error.message}`)

  const rows = (data ?? []) as unknown as (AttachmentDraft & {
    mod_plans: { title: string } | { title: string }[]
  })[]

  const signed = await signAttachments(
    rows.map(({ mod_plans: _mod, ...draft }) => draft as AttachmentDraft),
  )

  return signed.map((view, index) => {
    const parent = rows[index]?.mod_plans
    const title = Array.isArray(parent) ? (parent[0]?.title ?? '') : (parent?.title ?? '')
    return { ...view, mod_title: title }
  })
}
