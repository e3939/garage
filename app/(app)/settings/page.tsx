import type { Metadata } from 'next'
import Link from 'next/link'

import { currentUser } from '@/lib/queries/session'

export const metadata: Metadata = { title: 'Settings' }

/**
 * What settings there are, and where they live.
 *
 * Two of these are not on this route at all, and that is deliberate: budgets and
 * recurring templates are edited where they are read, next to the figures they
 * move. This screen is the index, not a second home for them.
 *
 * Export and import are here rather than buried, because docs/01-PRODUCT.md
 * calls export "a first-class feature — the data is yours and leaving must be
 * easy", and a first-class feature two taps from the front door is what that
 * means in practice. The base currency is still not editable anywhere, and the
 * screen stays quiet about it rather than apologising.
 */
const ROWS = [
  { href: '/settings/categories', name: 'Categories', detail: 'Icons, colours, defaults' },
  { href: '/money', name: 'Budgets and funds', detail: 'The monthly figure and the caps' },
  { href: '/money/recurring', name: 'Recurring', detail: 'Templates and when they next land' },
  { href: '/settings/export', name: 'Export', detail: 'Every table, as CSV or JSON' },
  { href: '/settings/import', name: 'Import', detail: 'A CSV of expenses, mapped and previewed' },
] as const

export default async function SettingsPage() {
  // The layout has already asked; this is the same answer, memoised.
  const user = await currentUser()

  return (
    <section className="space-y-6">
      <div className="rounded-md border border-border bg-surface p-4">
        <p className="text-eyebrow font-display uppercase text-ink-muted">Signed in as</p>
        <p className="mt-1 break-all font-mono text-body text-ink">{user?.email}</p>
      </div>

      <nav aria-label="Settings">
        <ul className="overflow-hidden rounded-md border border-border bg-surface">
          {ROWS.map((row, index) => (
            <li key={row.href} className={index < ROWS.length - 1 ? 'border-b border-border' : ''}>
              <Link
                href={row.href}
                className="flex min-h-touch items-center justify-between gap-4 px-4 py-3"
              >
                <span className="text-body text-ink">{row.name}</span>
                <span className="text-caption text-ink-muted">{row.detail}</span>
              </Link>
            </li>
          ))}
        </ul>
      </nav>
    </section>
  )
}
