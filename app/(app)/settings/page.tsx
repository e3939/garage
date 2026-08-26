import type { Metadata } from 'next'
import Link from 'next/link'

import { createClient } from '@/lib/supabase/server'

export const metadata: Metadata = { title: 'Settings' }

/**
 * What settings there are, and where they live.
 *
 * Two of these are not on this route at all, and that is deliberate: budgets and
 * recurring templates are edited where they are read, next to the figures they
 * move. This screen is the index, not a second home for them.
 *
 * The line this replaced said "Currency, budgets and export arrive in later
 * phases". Budgets arrived; the base currency and export are not editable
 * anywhere yet and the screen simply does not mention them, because an app
 * apologising for what it has not got is worse company than one that is quiet
 * about it.
 */
const ROWS = [
  { href: '/settings/categories', name: 'Categories', detail: 'Icons, colours, defaults' },
  { href: '/money', name: 'Budgets and funds', detail: 'The monthly figure and the caps' },
  { href: '/money/recurring', name: 'Recurring', detail: 'Templates and when they next land' },
] as const

export default async function SettingsPage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

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
