// Form state and pending state both live on the client.
'use client'

import { useActionState } from 'react'
import { useFormStatus } from 'react-dom'
import { requestMagicLink, type SignInState } from '@/app/auth/actions'
import { CircleNotch, ICON_UI, PaperPlaneTilt } from '@/components/icons'

type SignInFormProps = {
  next?: string
  initialError?: string
}

function SubmitButton() {
  const { pending } = useFormStatus()

  return (
    <button
      type="submit"
      disabled={pending}
      className="flex min-h-touch w-full items-center justify-center gap-2 rounded-md bg-accent px-4 text-label text-accent-ink transition-opacity duration-state ease-enter disabled:opacity-60"
    >
      {pending ? (
        <CircleNotch {...ICON_UI} className="animate-spin" aria-hidden />
      ) : (
        <PaperPlaneTilt {...ICON_UI} aria-hidden />
      )}
      {pending ? 'Sending' : 'Send sign-in link'}
    </button>
  )
}

export function SignInForm({ next, initialError }: SignInFormProps) {
  const initial: SignInState = initialError
    ? { status: 'error', message: initialError }
    : { status: 'idle' }

  const [state, formAction] = useActionState(requestMagicLink, initial)

  if (state.status === 'sent') {
    return (
      <div className="mt-6 rounded-md border border-border bg-surface p-4">
        <h2 className="text-title text-ink">Link sent</h2>
        <p className="mt-2 text-body text-ink-muted">
          Check <span className="font-mono">{state.email}</span> and open the link on this
          device. It expires in an hour.
        </p>
      </div>
    )
  }

  return (
    <form action={formAction} className="mt-6 space-y-4">
      {next ? <input type="hidden" name="next" value={next} /> : null}

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
          required
          aria-describedby={state.status === 'error' ? 'email-error' : undefined}
          aria-invalid={state.status === 'error' || undefined}
          className="min-h-touch w-full rounded-md border border-border bg-surface px-3 text-body text-ink placeholder:text-ink-faint"
          placeholder="you@example.com"
        />
      </div>

      {state.status === 'error' ? (
        <p id="email-error" role="alert" className="text-label text-critical">
          {state.message}
        </p>
      ) : null}

      <SubmitButton />
    </form>
  )
}
