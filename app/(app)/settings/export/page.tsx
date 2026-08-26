import type { Metadata } from 'next'

import { countEntities } from '@/lib/export/bundle'
import { EXPORT_ENTITIES } from '@/lib/export/entities'
import { fetchProfilePreferences } from '@/lib/queries/profile'

export const metadata: Metadata = { title: 'Export' }

/**
 * Leaving.
 *
 * docs/01-PRODUCT.md: "Export is a first-class feature — the data is yours and
 * leaving must be easy." So this screen is a list of files, not a wizard: every
 * artifact is one tap, the row counts are real, and nothing has to be requested
 * and waited for.
 *
 * The counts are fetched here rather than guessed, because a row of "Parts" with
 * nothing next to it tells you nothing about whether the file you just
 * downloaded is complete.
 */
export default async function ExportPage() {
  const [counts, preferences] = await Promise.all([countEntities(), fetchProfilePreferences()])

  const total = Object.values(counts).reduce((sum, count) => sum + count, 0)
  const attachments = counts.attachments ?? 0
  const number = (value: number) => value.toLocaleString(preferences.locale)

  return (
    <div className="space-y-6">
      <section className="space-y-2 rounded-md border border-border bg-surface p-4">
        <h2 className="text-label text-ink">Everything, in one file</h2>
        <p className="text-caption text-ink-muted">
          {number(total)} rows across {EXPORT_ENTITIES.length} tables, as JSON, with the
          attachment manifest included. This is the file to keep.
        </p>
        <a
          href="/api/export/garage.json"
          download
          className="mt-1 inline-flex min-h-touch items-center justify-center rounded-md border border-accent bg-accent px-4 text-body font-medium text-accent-ink"
        >
          Download garage.json
        </a>
      </section>

      <section className="space-y-2 rounded-md border border-border bg-surface p-4">
        <h2 className="text-label text-ink">Attachment manifest</h2>
        <p className="text-caption text-ink-muted">
          {attachments === 0
            ? 'No photos or documents stored yet. The manifest will be empty.'
            : `${number(attachments)} ${attachments === 1 ? 'file' : 'files'} in storage, each with a link that works for 24 hours from the moment you download this.`}
        </p>
        <a
          href="/api/export/attachments-manifest.csv"
          download
          className="mt-1 inline-flex min-h-touch items-center justify-center rounded-md border border-border-strong bg-surface px-4 text-body text-ink"
        >
          Download manifest
        </a>
      </section>

      <section className="space-y-3">
        <h2 className="text-eyebrow font-display uppercase text-ink-muted">One table at a time</h2>

        <ul className="overflow-hidden rounded-md border border-border bg-surface">
          {EXPORT_ENTITIES.map((entity, index) => (
            <li key={entity.key} className={index > 0 ? 'border-t border-border' : ''}>
              <a
                href={`/api/export/${entity.key}.csv`}
                download
                className="flex min-h-touch items-center justify-between gap-4 px-4 py-3"
              >
                <span className="min-w-0">
                  <span className="block text-body text-ink">{entity.label}</span>
                  <span className="block text-caption text-ink-muted">{entity.description}</span>
                </span>
                <span className="shrink-0 font-mono text-caption text-ink-muted">
                  {number(counts[entity.key] ?? 0)}
                </span>
              </a>
            </li>
          ))}
        </ul>
      </section>

      <p className="text-caption text-ink-muted">
        Amounts are written as whole minor units in the currency on the row, the way they are
        stored: 150000 is 150.000 ₫. Dates are ISO. The expenses file is the one the importer
        reads, and it carries each row&rsquo;s id, so importing it again adds nothing.
      </p>
    </div>
  )
}
