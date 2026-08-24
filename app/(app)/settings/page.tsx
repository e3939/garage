import type { Metadata } from 'next'
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
      <p className="text-body text-ink-muted">
        Categories, currency, defaults and export arrive in later phases.
      </p>
    </section>
  )
}
