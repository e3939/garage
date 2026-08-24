import { NextResponse, type NextRequest } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { env } from '@/lib/env'
import type { Database } from '@/lib/supabase/types'

/** Routes reachable without a session. Everything else redirects to sign-in. */
const PUBLIC_PATHS = ['/sign-in', '/auth']

function isPublic(pathname: string): boolean {
  return PUBLIC_PATHS.some(
    (path) => pathname === path || pathname.startsWith(`${path}/`),
  )
}

/**
 * Refreshes the auth cookie on every request and turns an expired session into
 * a redirect rather than a half-rendered protected page.
 *
 * The response object must be the one Supabase wrote cookies onto — building a
 * fresh NextResponse after this point silently drops the refreshed token.
 */
export async function updateSession(request: NextRequest) {
  let response = NextResponse.next({ request })

  const supabase = createServerClient<Database>(
    env.NEXT_PUBLIC_SUPABASE_URL,
    env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet) {
          for (const { name, value } of cookiesToSet) {
            request.cookies.set(name, value)
          }
          response = NextResponse.next({ request })
          for (const { name, value, options } of cookiesToSet) {
            response.cookies.set(name, value, options)
          }
        },
      },
    },
  )

  // Do not put anything between the client above and this call: it is what
  // refreshes the token, and reordering it causes random sign-outs.
  const {
    data: { user },
  } = await supabase.auth.getUser()

  const { pathname } = request.nextUrl

  if (!user && !isPublic(pathname)) {
    const url = request.nextUrl.clone()
    url.pathname = '/sign-in'
    url.search = ''
    if (pathname !== '/') url.searchParams.set('next', pathname)
    return NextResponse.redirect(url)
  }

  if (user && pathname === '/sign-in') {
    const url = request.nextUrl.clone()
    url.pathname = '/today'
    url.search = ''
    return NextResponse.redirect(url)
  }

  return response
}
