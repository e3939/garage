import type { ReactNode } from 'react'
import Link from 'next/link'
import type { Route } from 'next'

type AppHeaderProps = {
  title: string
  /** Optional eyebrow above the title — section markers, view labels. */
  eyebrow?: string
  /** Right-hand actions. Keep to two at most; this is a logbook, not a toolbar. */
  actions?: ReactNode
  /** Shown on a sub-page, in place of the eyebrow, as a link back up. */
  back?: { href: Route; label: string }
}

/**
 * Fills the shell's header slot. Sticky, hairline-ruled, no shadow — elevation
 * in this app is rules and tint. See docs/03-DESIGN.md.
 */
export function AppHeader({ title, eyebrow, actions, back }: AppHeaderProps) {
  return (
    <header className="sticky top-0 z-10 border-b border-border bg-bg/95 backdrop-blur">
      <div className="mx-auto flex max-w-content items-center justify-between gap-4 px-4 py-3">
        <div className="min-w-0">
          {back ? (
            <Link href={back.href} className="text-eyebrow font-display uppercase text-accent">
              {back.label}
            </Link>
          ) : eyebrow ? (
            <p className="text-eyebrow font-display uppercase text-ink-muted">{eyebrow}</p>
          ) : null}
          <h1 className="truncate font-display text-display text-ink">{title}</h1>
        </div>
        {actions ? <div className="flex shrink-0 items-center gap-2">{actions}</div> : null}
      </div>
    </header>
  )
}
