// The stage, the cooldown timer and auto-submit are all client state.
'use client'

import { useActionState, useEffect, useRef, useState } from 'react'
import { signIn } from '@/app/auth/actions'
import {
  CODE_LENGTH,
  RESEND_COOLDOWN_SECONDS,
  initialSignInState,
  type SignInState,
} from '@/app/auth/sign-in-state'
import { CodeInput } from '@/app/sign-in/code-input'
import { ICON_UI, PaperPlaneTilt } from '@/components/icons'
import { INPUT_CLASS } from '@/components/ui/field'

type SignInFormProps = {
  next?: string
  initialError?: string
}

const BUTTON_CLASS = [
  'flex min-h-touch w-full items-center justify-center gap-2 rounded-md',
  'bg-accent px-4 text-label text-accent-ink',
  'transition-opacity duration-state ease-enter disabled:opacity-60',
].join(' ')

export function SignInForm({ next, initialError }: SignInFormProps) {
  const initial: SignInState = { ...initialSignInState, next, error: initialError }
  const [state, formAction, pending] = useActionState(signIn, initial)

  const codeFormRef = useRef<HTMLFormElement>(null)

  if (state.stage === 'code') {
    return (
      <div className="mt-3 space-y-4">
        <div>
          <h2 className="text-title text-ink">Enter the code</h2>
          <p className="mt-1 text-body text-ink-muted">
            Sent to <span className="font-mono">{state.email}</span>. It expires in an hour.
          </p>
        </div>

        <form ref={codeFormRef} action={formAction} className="space-y-3">
          <input type="hidden" name="intent" value="verify" />
          {next ? <input type="hidden" name="next" value={next} /> : null}

          <CodeInput
            id="code"
            name="code"
            length={CODE_LENGTH}
            disabled={pending}
            key={`${state.sentAt ?? 0}:${state.attempt ?? 0}`}
            invalid={Boolean(state.error)}
            onComplete={() => codeFormRef.current?.requestSubmit()}
          />

          {state.error ? (
            <p role="alert" className="text-label text-critical">
              {state.error}
            </p>
          ) : null}

          {/* The code submits itself on the last digit. This is the keyboard
              path, and the path when autofill fills the field without firing
              the handler the way a keystroke does. */}
          {/* No spinner. docs/03-DESIGN.md: nothing loops, and skeletons rather
              than spinners — and the label already says what is happening, which
              is the part a screen reader gets either way. */}
          <button type="submit" disabled={pending} className={BUTTON_CLASS}>
            {pending ? 'Checking' : 'Sign in'}
          </button>
        </form>

        <div className="flex items-center justify-between gap-3">
          <form action={formAction}>
            <input type="hidden" name="intent" value="send" />
            {next ? <input type="hidden" name="next" value={next} /> : null}
            <ResendButton key={state.sentAt ?? 0} disabled={pending} />
          </form>

          <form action={formAction}>
            <input type="hidden" name="intent" value="change-email" />
            {next ? <input type="hidden" name="next" value={next} /> : null}
            <button
              type="submit"
              disabled={pending}
              className="min-h-touch text-label text-ink-muted underline underline-offset-4"
            >
              Use a different email
            </button>
          </form>
        </div>
      </div>
    )
  }

  return (
    <form action={formAction} className="mt-3 space-y-4">
      <input type="hidden" name="intent" value="send" />
      {next ? <input type="hidden" name="next" value={next} /> : null}

      {/* Lives here rather than on the page so it disappears once the code has
          been sent, where it would otherwise contradict the screen. */}
      <p className="text-body text-ink-muted">
        Enter your email and we will send you a six-digit code. No password.
      </p>

      <div className="space-y-2">
        <label htmlFor="email" className="block text-label text-ink">
          Email
        </label>
        <input
          id="email"
          name="email"
          type="email"
          autoComplete="email"
          inputMode="email"
          defaultValue={state.email}
          required
          aria-describedby={state.error ? 'email-error' : undefined}
          aria-invalid={Boolean(state.error) || undefined}
          className={INPUT_CLASS}
          placeholder="you@example.com"
        />
      </div>

      {state.error ? (
        <p id="email-error" role="alert" className="text-label text-critical">
          {state.error}
        </p>
      ) : null}

      <button type="submit" disabled={pending} className={BUTTON_CLASS}>
        {pending ? null : <PaperPlaneTilt {...ICON_UI} aria-hidden />}
        {pending ? 'Sending' : 'Send code'}
      </button>
    </form>
  )
}

/**
 * Remounted on every code sent, so the countdown restarts without an effect
 * writing state on the way in. The deadline comes from this device's clock, so
 * a skewed server clock cannot strand the button.
 */
function ResendButton({ disabled }: { disabled: boolean }) {
  const [remaining, setRemaining] = useState(RESEND_COOLDOWN_SECONDS)

  useEffect(() => {
    const deadline = Date.now() + RESEND_COOLDOWN_SECONDS * 1000

    const tick = setInterval(() => {
      const left = Math.max(0, Math.ceil((deadline - Date.now()) / 1000))
      setRemaining(left)
      if (left === 0) clearInterval(tick)
    }, 500)

    return () => clearInterval(tick)
  }, [])

  return (
    <button
      type="submit"
      disabled={disabled || remaining > 0}
      className="min-h-touch text-label text-ink-muted underline underline-offset-4 disabled:no-underline disabled:opacity-60"
    >
      {remaining > 0 ? `Resend code in ${remaining}s` : 'Resend code'}
    </button>
  )
}
