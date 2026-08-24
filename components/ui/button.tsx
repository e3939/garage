import type { ButtonHTMLAttributes, ReactNode } from 'react'

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger'
type Size = 'md' | 'sm'

const VARIANT: Record<Variant, string> = {
  primary: 'bg-accent text-accent-ink border-accent',
  secondary: 'bg-surface text-ink border-border-strong',
  ghost: 'bg-transparent text-ink-muted border-transparent',
  danger: 'bg-transparent text-critical border-critical',
}

const SIZE: Record<Size, string> = {
  md: 'min-h-touch px-4 text-body',
  sm: 'min-h-touch px-3 text-label',
}

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: Variant
  size?: Size
  children: ReactNode
}

/**
 * Buttons name the outcome, so this component takes children and never invents
 * copy. Every size clears the 44px touch floor from docs/03-DESIGN.md.
 */
export function Button({
  variant = 'secondary',
  size = 'md',
  className = '',
  type = 'button',
  children,
  ...rest
}: ButtonProps) {
  return (
    <button
      type={type}
      className={[
        'inline-flex items-center justify-center gap-2 rounded-md border font-medium',
        'transition-transform duration-state ease-enter active:scale-[0.98]',
        'disabled:pointer-events-none disabled:opacity-50',
        VARIANT[variant],
        SIZE[size],
        className,
      ].join(' ')}
      {...rest}
    >
      {children}
    </button>
  )
}
