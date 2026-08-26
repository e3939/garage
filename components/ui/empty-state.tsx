import type { ReactNode } from 'react'

import { ICON_EMPTY, type Icon } from '@/components/icons'

type EmptyStateProps = {
  /** Duotone, 32px. The concept's canonical glyph, never an improvised one. */
  icon: Icon
  /**
   * One sentence of direction. Not a paragraph, not an apology, and not a
   * heading followed by a paragraph — docs/03-DESIGN.md is specific about the
   * shape, and the copy voice is specific about the tone: "No fuel logged yet.
   * Add your first fill-up to start tracking consumption."
   */
  children: ReactNode
  /**
   * One button. Optional only where the screen genuinely has nothing to offer —
   * a report of a month nobody spent anything in has no action attached to it
   * that is not a lie about what the button will do.
   */
  action?: ReactNode
}

/**
 * The empty state, in the one shape the design system has for it.
 *
 * It exists as a component rather than as a paragraph repeated eleven times so
 * that the icon size, the tone and the single-button rule are decided once. An
 * empty screen is the first thing a new user sees on most of these routes, and
 * a screen that says nothing looks broken rather than new.
 */
export function EmptyState({ icon: Icon, children, action }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-start gap-3 rounded-md border border-border bg-surface p-6">
      <Icon {...ICON_EMPTY} className="text-ink-faint" aria-hidden />
      <p className="text-body text-ink-muted">{children}</p>
      {action}
    </div>
  )
}
