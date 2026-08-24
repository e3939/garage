import type { ReactNode } from 'react'
import { redirect } from 'next/navigation'
import { BottomNav } from '@/components/shell/bottom-nav'
import { createClient } from '@/lib/supabase/server'

type AppLayoutProps = {
  children: ReactNode
  /** Header slot — each route fills it from app/(app)/@header. */
  header: ReactNode
  /** FAB slot — the persistent brick action, opted out of per route. */
  fab: ReactNode
}

/**
 * The authenticated shell. The proxy already redirects anonymous requests, but
 * this check is what actually protects the data: the proxy runs at the edge of
 * a request and a matcher typo would silently open every page underneath.
 */
export default async function AppLayout({ children, header, fab }: AppLayoutProps) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) redirect('/sign-in')

  return (
    <div className="min-h-dvh">
      {header}
      <main
        className="mx-auto max-w-content px-4 py-6"
        style={{
          paddingBottom: 'calc(var(--nav-height) + var(--space-12) + env(safe-area-inset-bottom))',
        }}
      >
        {children}
      </main>
      {fab}
      <BottomNav />
    </div>
  )
}
