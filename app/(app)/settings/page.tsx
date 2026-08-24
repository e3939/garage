import type { Metadata } from 'next'
import Link from 'next/link'

import { createClient } from '@/lib/supabase/server'

export const metadata: Metadata = { title: 'Settings' }

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
          <li>
            <Link
              href="/settings/categories"
              className="flex min-h-touch items-center justify-between gap-4 px-4 py-3"
            >
              <span className="text-body text-ink">Categories</span>
              <span className="text-caption text-ink-muted">Icons, colours, defaults</span>
            </Link>
          </li>
        </ul>
      </nav>

      <p className="text-body text-ink-muted">
        Currency, budgets and export arrive in later phases.
      </p>
    </section>
  )
}
