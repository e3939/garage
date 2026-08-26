import 'server-only'

/**
 * Reading everything out.
 *
 * Every query here is an ordinary authenticated select, so RLS is what decides
 * what "everything" is — the export cannot reach a row the app cannot show, and
 * there is no service key anywhere near it. That is deliberate: an export
 * endpoint holding a key that bypasses row-level security is the single most
 * dangerous thing this codebase could grow.
 *
 * Rows are pulled in pages, because PostgREST caps a response at a thousand
 * rows by default and a ledger that has been kept for three years is longer than
 * that. A truncated export that looked complete would be worse than no export.
 */

import { createClient } from '@/lib/supabase/server'
import { toCsv, rowsFromRecords } from '@/lib/csv/format'
import {
  EXPORT_ENTITIES,
  MANIFEST_COLUMNS,
  MANIFEST_TTL_SECONDS,
  type ExportEntity,
} from '@/lib/export/entities'
import type { StorageBucket } from '@/lib/attachments/types'

/** One page. Chosen to sit under PostgREST's own ceiling with room to spare. */
const PAGE = 500

export type ExportRow = Record<string, unknown>

/**
 * `{ category: { name } }` is what an embedded select returns. The CSV wants a
 * cell, so the embed is flattened onto the name of the relation and the object
 * is dropped. Nothing else in the row is touched.
 */
function flattenEmbeds(row: ExportRow): ExportRow {
  const flat: ExportRow = {}
  for (const [key, value] of Object.entries(row)) {
    if (value !== null && typeof value === 'object' && !Array.isArray(value)) {
      const embedded = value as Record<string, unknown>
      const keys = Object.keys(embedded)
      // A one-column embed is a name. Anything else is left as JSON.
      if (keys.length === 1 && keys[0] !== undefined) {
        flat[key] = embedded[keys[0]]
        continue
      }
    }
    flat[key] = value
  }
  return flat
}

/** Every row of one entity, in order, in pages. */
export async function fetchEntityRows(entity: ExportEntity): Promise<ExportRow[]> {
  const supabase = await createClient()
  const rows: ExportRow[] = []

  // A stable tiebreak, so a row cannot land on two pages or on none when the
  // ordering column repeats. `mod_dependencies` is the one table with no id of
  // its own, and its first column is half of its primary key.
  const tiebreak = entity.columns.includes('id') ? 'id' : (entity.columns[0] ?? entity.order.column)

  for (let from = 0; ; from += PAGE) {
    const { data, error } = await supabase
      .from(entity.table)
      .select(entity.select)
      .order(entity.order.column, { ascending: entity.order.ascending, nullsFirst: false })
      .order(tiebreak, { ascending: true })
      .range(from, from + PAGE - 1)

    if (error) throw new Error(`${entity.key} export failed: ${error.message}`)

    const page = (data ?? []) as unknown as ExportRow[]
    for (const row of page) rows.push(flattenEmbeds(row))

    if (page.length < PAGE) break
  }

  return rows
}

/** One entity as a CSV file. */
export async function entityCsv(entity: ExportEntity): Promise<string> {
  const rows = await fetchEntityRows(entity)
  return toCsv(entity.columns, rowsFromRecords(entity.columns, rows))
}

/** How many rows each entity holds, for the screen. One head request each. */
export async function countEntities(): Promise<Record<string, number>> {
  const supabase = await createClient()

  const counts = await Promise.all(
    EXPORT_ENTITIES.map(async (entity) => {
      const { count, error } = await supabase
        .from(entity.table)
        .select('*', { count: 'exact', head: true })
      if (error) return [entity.key, 0] as const
      return [entity.key, count ?? 0] as const
    }),
  )

  return Object.fromEntries(counts)
}

/** Which column of `attachments` is set says what the file is attached to. */
const ATTACHED_TO: readonly { column: string; label: string }[] = [
  { column: 'expense_id', label: 'expense' },
  { column: 'mod_plan_id', label: 'mod_plan' },
  { column: 'service_record_id', label: 'service_record' },
  { column: 'fuel_log_id', label: 'fuel_log' },
  { column: 'part_id', label: 'part' },
  { column: 'timeline_note_id', label: 'timeline_note' },
]

export type ManifestRow = Record<(typeof MANIFEST_COLUMNS)[number], string | number | null>

/**
 * The attachment manifest: one row per stored object, with a URL good for
 * twenty-four hours.
 *
 * Signed in one request per bucket rather than one per file — a build log with
 * four hundred progress shots would otherwise be four hundred round trips, and
 * the storage API takes a batch. The URLs are not put through the app's signed-
 * URL cache: that cache exists to hand the same one-hour URL to several images
 * on a page, and a day-long URL has no business living in it.
 */
export async function buildManifest(expiresAt: string): Promise<ManifestRow[]> {
  const supabase = await createClient()

  const entity = EXPORT_ENTITIES.find((candidate) => candidate.key === 'attachments')
  if (!entity) return []

  const attachments = await fetchEntityRows(entity)
  if (attachments.length === 0) return []

  const byBucket = new Map<StorageBucket, string[]>()
  for (const attachment of attachments) {
    const bucket = attachment.bucket_name as StorageBucket
    const path = attachment.storage_path as string
    if (!bucket || !path) continue
    byBucket.set(bucket, [...(byBucket.get(bucket) ?? []), path])
  }

  const urls = new Map<string, string>()
  await Promise.all(
    [...byBucket].map(async ([bucket, paths]) => {
      const { data } = await supabase.storage.from(bucket).createSignedUrls(paths, MANIFEST_TTL_SECONDS)
      for (const entry of data ?? []) {
        if (!entry.signedUrl || entry.error || !entry.path) continue
        urls.set(`${bucket}/${entry.path}`, entry.signedUrl)
      }
    }),
  )

  return attachments.map((attachment) => {
    const owner = ATTACHED_TO.find((candidate) => attachment[candidate.column] !== null)

    return {
      attachment_id: (attachment.id as string) ?? null,
      bucket: (attachment.bucket_name as string) ?? null,
      storage_path: (attachment.storage_path as string) ?? null,
      kind: (attachment.kind as string) ?? null,
      caption: (attachment.caption as string) ?? null,
      bytes: (attachment.bytes as number) ?? null,
      width: (attachment.width as number) ?? null,
      height: (attachment.height as number) ?? null,
      attached_to: owner?.label ?? null,
      attached_id: owner ? ((attachment[owner.column] as string) ?? null) : null,
      signed_url: urls.get(`${attachment.bucket_name}/${attachment.storage_path}`) ?? null,
      expires_at: expiresAt,
    }
  })
}

export async function manifestCsv(expiresAt: string): Promise<string> {
  const rows = await buildManifest(expiresAt)
  return toCsv(MANIFEST_COLUMNS, rowsFromRecords(MANIFEST_COLUMNS, rows))
}

export type ExportBundle = {
  garage: {
    exported_at: string
    format: number
    app: string
    /** Every URL in `attachments_manifest` stops working at this moment. */
    attachment_urls_expire_at: string
  }
  data: Record<string, ExportRow[]>
  attachments_manifest: ManifestRow[]
}

/**
 * One JSON file with all of it, including the manifest.
 *
 * `format` is a version number for the shape of this file rather than for the
 * app. It is 1, and it will only ever change if a future version of this app
 * has to be able to tell two shapes apart.
 */
export async function buildBundle(exportedAt: string, expiresAt: string): Promise<ExportBundle> {
  const entries = await Promise.all(
    EXPORT_ENTITIES.map(async (entity) => [entity.key, await fetchEntityRows(entity)] as const),
  )

  return {
    garage: {
      exported_at: exportedAt,
      format: 1,
      app: 'Garage',
      attachment_urls_expire_at: expiresAt,
    },
    data: Object.fromEntries(entries),
    attachments_manifest: await buildManifest(expiresAt),
  }
}
