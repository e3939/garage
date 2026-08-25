'use server'

import { redirect } from 'next/navigation'
import { z } from 'zod'
import type { AuthError } from '@supabase/supabase-js'
import { createClient } from '@/lib/supabase/server'
import { siteUrl } from '@/lib/env'
import {
  CODE_LENGTH,
  type SignInState,
} from '@/app/auth/sign-in-state'

/**
 * Sign-in is a six-digit code, not a magic link.
 *
 * A link has to be opened in the same browser that asked for it, because that
 * is where the PKCE verifier lives. On a phone the link opens in the mail
 * client's own browser instead, and sign-in fails. A code has no such coupling:
 * it is read on one screen and typed on the same screen.
 *
 * The auth model is unchanged. Supabase issues the session, `auth.uid()` is the
 * same value, and every RLS policy still keys on it.
 */

const emailSchema = z.email('Enter a valid email address.')
const nextSchema = z.string().startsWith('/').optional()
const codeSchema = z
  .string()
  .regex(new RegExp(`^\\d{${CODE_LENGTH}}$`), `Enter all ${CODE_LENGTH} digits.`)

/**
 * Supabase error codes mapped to something a person can act on. The raw
 * message is never shown: it is written for a developer reading a stack trace,
 * and it leaks whether an address has an account.
 */
function friendlyError(error: AuthError): string {
  switch (error.code) {
    case 'otp_expired':
      // GoTrue returns this for a wrong code as well as an expired one, so the
      // copy has to cover both without guessing which happened.
      return 'That code did not work. It may have expired — send a new one.'
    case 'over_email_send_rate_limit':
      return 'Too many codes sent to that address. Wait a few minutes before asking for another.'
    case 'over_request_rate_limit':
      return 'Too many attempts from this device. Wait a few minutes and try again.'
    case 'email_address_invalid':
      return 'That email address was rejected. Check it and try again.'
    case 'email_address_not_authorized':
      return 'That email address is not allowed to sign in to this project.'
    case 'signup_disabled':
      return 'This project is not accepting new accounts.'
    case 'validation_failed':
      return `Enter all ${CODE_LENGTH} digits.`
    default:
      break
  }

  if (error.status === 429) {
    return 'Too many attempts. Wait a few minutes and try again.'
  }
  if (error.status === 401 || error.status === 403) {
    return 'That code did not work. Check the digits, or send a new one.'
  }
  return 'Sign-in did not go through. Try again in a moment.'
}

/**
 * One action for the whole screen. `intent` says which step ran, and the state
 * it returns says which step to render — so the stage never disagrees with the
 * server, and a failed resend cannot knock the user back to the email field.
 */
export async function signIn(
  previous: SignInState,
  formData: FormData,
): Promise<SignInState> {
  const intent = String(formData.get('intent') ?? 'send')
  const next = nextSchema.safeParse(String(formData.get('next') ?? '')).data

  if (intent === 'change-email') {
    return { stage: 'email', email: previous.email, next }
  }

  if (intent === 'verify') {
    return verify(previous, formData, next)
  }

  return send(previous, formData, next)
}

async function send(
  previous: SignInState,
  formData: FormData,
  next: string | undefined,
): Promise<SignInState> {
  // A resend carries no email field; it reuses the address already accepted.
  const raw = formData.get('email')
  const candidate = raw === null ? previous.email : String(raw).trim()
  const parsed = emailSchema.safeParse(candidate)

  if (!parsed.success) {
    return {
      ...previous,
      next,
      error: parsed.error.issues[0]?.message ?? 'Enter a valid email address.',
    }
  }

  const email = parsed.data
  const supabase = await createClient()

  // `emailRedirectTo` is still sent so a template carrying both a code and a
  // link keeps working, and so links already in an inbox still land somewhere
  // real. /auth/callback is untouched.
  const callback = new URL('/auth/callback', siteUrl())
  if (next) callback.searchParams.set('next', next)

  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: { shouldCreateUser: true, emailRedirectTo: callback.toString() },
  })

  if (error) {
    // Stay on whichever step asked, so a rate-limited resend does not throw
    // away a code the user is holding.
    return { ...previous, email, next, error: friendlyError(error) }
  }

  return { stage: 'code', email, next, sentAt: Date.now() }
}

async function verify(
  previous: SignInState,
  formData: FormData,
  next: string | undefined,
): Promise<SignInState> {
  const attempt = (previous.attempt ?? 0) + 1
  const failed = (error: string): SignInState => ({
    ...previous,
    stage: 'code',
    next,
    error,
    attempt,
  })

  const email = emailSchema.safeParse(previous.email)
  if (!email.success) {
    return { stage: 'email', email: '', next, error: 'Start again with your email address.' }
  }

  const code = codeSchema.safeParse(
    String(formData.get('code') ?? '').replace(/\D/g, ''),
  )
  if (!code.success) {
    return failed(code.error.issues[0]?.message ?? `Enter all ${CODE_LENGTH} digits.`)
  }

  const supabase = await createClient()
  const { error } = await supabase.auth.verifyOtp({
    email: email.data,
    token: code.data,
    type: 'email',
  })

  if (error) {
    return failed(friendlyError(error))
  }

  // Outside the branch above on purpose: redirect() signals by throwing, and a
  // try/catch around it would swallow the navigation.
  redirect(next ?? '/today')
}

export async function signOut(): Promise<never> {
  const supabase = await createClient()
  await supabase.auth.signOut()
  redirect('/sign-in')
}
