// An error boundary is a client component by definition: it has to catch.
'use client'

import { useEffect } from 'react'

/**
 * The gap between the two boundaries that already existed.
 *
 * `app/(app)/error.tsx` covers the pages inside the authenticated shell, but a
 * boundary never catches its own segment's layout — so a failure in
 * `app/(app)/layout.tsx`, which is where the session is checked, skipped past
 * it and landed on `global-error.tsx`. That one replaces `<html>` entirely, so
 * the app's fonts and tokens are gone and the result reads like a crash rather
 * than a screen that did not load.
 *
 * This sits above the route group and below the root layout, so it catches that
 * case with the stylesheet still attached. `global-error.tsx` stays as the last
 * resort for a failure in the root layout itself.
 */
export default function RootError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    console.error(error)
  }, [error])

  return (
    <main className="safe-x mx-auto flex min-h-dvh max-w-content flex-col justify-center py-12">
      <div className="flex flex-col items-start gap-3 rounded-md border border-border bg-surface p-6">
        <h1 className="font-display text-display text-ink">Garage did not load</h1>
        <p className="text-body text-ink-muted">
          Nothing has been lost. Try again, and if it keeps happening check the connection.
        </p>
        {error.digest ? (
          <p className="font-mono text-caption text-ink-faint">{error.digest}</p>
        ) : null}
        <button
          type="button"
          onClick={reset}
          className="min-h-touch rounded-md bg-accent px-4 text-label text-accent-ink"
        >
          Try again
        </button>
      </div>
    </main>
  )
}
