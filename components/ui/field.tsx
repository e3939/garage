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

/**
 * Label above, control, then one line of hint or error. Forms are labelled.
 *
 * `min-w-0` is load-bearing. A grid or flex item's minimum width is `auto`,
 * which means it refuses to shrink below its content's intrinsic width — and an
 * `input` carries a default intrinsic width of roughly twenty characters
 * whatever `w-full` says. Two fields side by side in a `grid-cols-2` therefore
 * add up to more than a 390pt sheet, and the sheet pans sideways to show them.
 */
export function Field({ label, htmlFor, hint, error, children, className = '' }: FieldProps) {
  return (
    <div className={`min-w-0 space-y-1 ${className}`}>
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

/**
 * `text-input` rather than `text-body` on purpose: 15px body text is right for
 * reading and wrong for a control, because iOS Safari zooms the page when a
 * focused control is under 16px and never zooms back out.
 */
export const INPUT_CLASS = [
  'w-full min-h-touch rounded-md border border-border-strong bg-surface px-3',
  'text-input text-ink placeholder:text-ink-faint',
  'outline-none',
].join(' ')
