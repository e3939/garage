import type { NextRequest } from 'next/server'
import { updateSession } from '@/lib/supabase/proxy'

export async function proxy(request: NextRequest) {
  return updateSession(request)
}

export const config = {
  matcher: [
    /*
     * Everything except static assets and image files. Running on those would
     * cost a Supabase round-trip per icon for no benefit.
     *
     * `sw.js` is excluded for a second reason. A service worker script may not
     * be served from behind a redirect — the browser refuses the registration
     * outright — and this proxy redirects anything without a session to
     * `/sign-in`. Registration happens on the sign-in page too, so a worker
     * behind auth is a worker that never installs, which is what a Lighthouse
     * run caught: "The script resource is behind a redirect, which is
     * disallowed."
     */
    '/((?!_next/static|_next/image|favicon.ico|manifest.webmanifest|sw.js|robots.txt|icons/.*|.*\\.(?:svg|png|jpg|jpeg|gif|webp|woff2)$).*)',
  ],
}
