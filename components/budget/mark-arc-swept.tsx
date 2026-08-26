// Writes the cookie the server reads next time, so it has to run in the browser.
'use client'

import { useEffect } from 'react'

import { ARC_SWEPT_COOKIE } from '@/components/budget/arc-session'

/** The sweep's own duration, from --duration-arc. */
const SWEEP_MS = 600

/**
 * Renders nothing. Mounted beside a dial that is sweeping, and its whole job is
 * to make sure the next one does not.
 *
 * The cookie goes out immediately, so a reload lands on a dial at rest. The
 * attribute waits until the sweep is spent, because it is what the CSS reads to
 * suppress the animation and setting it now would stop the needle halfway.
 */
export function MarkArcSwept() {
  useEffect(() => {
    // No Max-Age and no Expires: the browser drops it when the session ends,
    // which is the definition this is trying to honour.
    document.cookie = `${ARC_SWEPT_COOKIE}=1; path=/; SameSite=Lax`

    const timer = setTimeout(() => {
      document.documentElement.dataset.arcSwept = 'true'
    }, SWEEP_MS)

    return () => clearTimeout(timer)
  }, [])

  return null
}
