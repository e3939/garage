/**
 * Shape of the sign-in screen's state machine.
 *
 * It lives here rather than in `actions.ts` because a `'use server'` module may
 * only export async functions — `initialSignInState` is a value, not an action.
 */

export type SignInStage = 'email' | 'code'

export type SignInState = {
  stage: SignInStage
  /** Carried across both steps: a resend and a verify both need it. */
  email: string
  /** Where to land after signing in. Always an in-app path. */
  next?: string
  /** Plain-language message. Never a raw Supabase string. */
  error?: string
  /** Changes on every code sent, so the client restarts its resend cooldown. */
  sentAt?: number
  /** Changes on every failed verify, so the client clears the code boxes. */
  attempt?: number
}

export const initialSignInState: SignInState = { stage: 'email', email: '' }

/** docs/03-DESIGN.md has no OTP length; Supabase's default is six. */
export const CODE_LENGTH = 6

/** Long enough that a slow inbox is not raced, short enough to feel available. */
export const RESEND_COOLDOWN_SECONDS = 30
