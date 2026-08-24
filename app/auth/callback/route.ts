import { NextResponse, type NextRequest } from 'next/server'
import type { EmailOtpType } from '@supabase/supabase-js'
import { createClient } from '@/lib/supabase/server'

/**
 * Where a magic link lands. @supabase/ssr uses PKCE, so the usual arrival is
 * `?code=`; the `token_hash` branch covers a project configured with the older
 * implicit template, so a working link is never rejected on a technicality.
 */
export async function GET(request: NextRequest) {
  const { searchParams, origin } = request.nextUrl

  const nextParam = searchParams.get('next')
  const next = nextParam?.startsWith('/') ? nextParam : '/today'

  const code = searchParams.get('code')
  const tokenHash = searchParams.get('token_hash')
  const type = searchParams.get('type') as EmailOtpType | null

  const supabase = await createClient()

  if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code)
    if (!error) return NextResponse.redirect(new URL(next, origin))
    return NextResponse.redirect(signInWithError(origin, error.message))
  }

  if (tokenHash && type) {
    const { error } = await supabase.auth.verifyOtp({ type, token_hash: tokenHash })
    if (!error) return NextResponse.redirect(new URL(next, origin))
    return NextResponse.redirect(signInWithError(origin, error.message))
  }

  return NextResponse.redirect(
    signInWithError(origin, 'That link is missing its token. Request a new one.'),
  )
}

function signInWithError(origin: string, message: string): URL {
  const url = new URL('/sign-in', origin)
  url.searchParams.set('error', message)
  return url
}
