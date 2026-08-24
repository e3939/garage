'use server'

import { redirect } from 'next/navigation'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { siteUrl } from '@/lib/env'

export type SignInState =
  | { status: 'idle' }
  | { status: 'sent'; email: string }
  | { status: 'error'; message: string }

const signInSchema = z.object({
  email: z.email('Enter a valid email address.'),
  next: z.string().startsWith('/').optional(),
})

/**
 * Magic link only. There is no password and no sign-up form: a first sign-in
 * and a return visit are the same action, which is the whole appeal.
 */
export async function requestMagicLink(
  _previous: SignInState,
  formData: FormData,
): Promise<SignInState> {
  const parsed = signInSchema.safeParse({
    email: String(formData.get('email') ?? '').trim(),
    next: formData.get('next') ? String(formData.get('next')) : undefined,
  })

  if (!parsed.success) {
    return {
      status: 'error',
      message: z.flattenError(parsed.error).fieldErrors.email?.[0] ?? 'Enter a valid email address.',
    }
  }

  const { email, next } = parsed.data
  const callback = new URL('/auth/callback', siteUrl())
  if (next) callback.searchParams.set('next', next)

  const supabase = await createClient()
  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: { emailRedirectTo: callback.toString() },
  })

  if (error) {
    return { status: 'error', message: error.message }
  }

  return { status: 'sent', email }
}

export async function signOut(): Promise<never> {
  const supabase = await createClient()
  await supabase.auth.signOut()
  redirect('/sign-in')
}
