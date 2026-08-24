import type { ReactNode } from 'react'

type FieldProps = {
  label: string
  htmlFor?: string
  /** Shown under the control: the parsed amount, a unit, a consequence. */
  hint?: ReactNode
  error?: string | null
  children: ReactNode
  className?: string
}

/** Label above, control, then one line of hint or error. Forms are labelled. */
export function Field({ label, htmlFor, hint, error, children, className = '' }: FieldProps) {
  return (
    <div className={`space-y-1 ${className}`}>
      <label htmlFor={htmlFor} className="block text-label text-ink-muted">
        {label}
      </label>
      {children}
      {error ? (
        <p className="text-caption text-critical">{error}</p>
      ) : hint ? (
        <p className="text-caption text-ink-muted">{hint}</p>
      ) : null}
    </div>
  )
}

export const INPUT_CLASS = [
  'w-full min-h-touch rounded-md border border-border-strong bg-surface px-3',
  'text-body text-ink placeholder:text-ink-faint',
  'outline-none',
].join(' ')
