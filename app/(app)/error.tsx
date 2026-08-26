// An error boundary is a client component by definition: it has to catch.
'use client'

import { useEffect } from 'react'

import { WarningCircle, ICON_EMPTY } from '@/components/icons'
import { Button } from '@/components/ui/button'

/**
 * When a screen fails.
 *
 * The shell stays — header, bottom bar, FAB — so this is one panel in the
 * column rather than a white page, and the way out is the bottom bar as much as
 * it is the button. `reset()` re-renders the route without a full reload, which
 * on a dropped connection is usually all it takes.
 *
 * Copy voice: plain, and it does not apologise. It also does not print the
 * exception. A digest is what a person can read out over a phone; a stack trace
 * is what an attacker reads instead.
 */
export default function AppError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    // The server logs its own; this is the browser's half of the same story.
    console.error(error)
  }, [error])

  return (
    <div className="flex flex-col items-start gap-3 rounded-md border border-border bg-surface p-6">
      <WarningCircle {...ICON_EMPTY} className="text-critical" aria-hidden />
      <h1 className="text-title text-ink">This screen did not load</h1>
      <p className="text-body text-ink-muted">
        Nothing has been lost. Try again, and if it keeps happening check the connection.
      </p>
      {error.digest ? (
        <p className="font-mono text-caption text-ink-faint">{error.digest}</p>
      ) : null}
      <Button variant="primary" onClick={reset}>
        Try again
      </Button>
    </div>
  )
}
