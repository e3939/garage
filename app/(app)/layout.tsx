import type { ReactNode } from 'react'
import { redirect } from 'next/navigation'
import { ExpenseStoreProvider } from '@/components/expenses/expense-store'
import { BottomNav } from '@/components/shell/bottom-nav'
import { ToastProvider } from '@/components/ui/toast'
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
    <ToastProvider>
      {/* One optimistic queue for the shell: quick add lives in the FAB slot, a
          sibling of the page, and both have to move at the same moment. */}
      <ExpenseStoreProvider>
        <div className="min-h-dvh">
          {header}
          <main
            className="safe-x mx-auto max-w-content py-6"
            style={{
              paddingBottom:
                'calc(var(--nav-height) + var(--space-12) + env(safe-area-inset-bottom))',
            }}
          >
            {children}
          </main>
          {fab}
          <BottomNav />
        </div>
      </ExpenseStoreProvider>
    </ToastProvider>
  )
}
