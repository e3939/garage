// Service worker registration is a browser API with no server equivalent.
'use client'

import { useEffect } from 'react'

/**
 * Registers the no-op worker in public/sw.js, which is what makes the app
 * installable. Production only: a worker sitting in front of Fast Refresh in
 * development costs an afternoon to stale reloads.
 */
export function RegisterServiceWorker() {
  useEffect(() => {
    if (process.env.NODE_ENV !== 'production') return
    if (!('serviceWorker' in navigator)) return

    const register = () => {
      void navigator.serviceWorker.register('/sw.js', { scope: '/' })
    }

    if (document.readyState === 'complete') {
      register()
      return
    }

    window.addEventListener('load', register, { once: true })
    return () => window.removeEventListener('load', register)
  }, [])

  return null
}
