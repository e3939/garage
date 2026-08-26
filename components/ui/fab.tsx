import type { ReactNode } from 'react'

type FabProps = {
  onClick: () => void
  /**
   * Fired as the finger lands, before the click. For warming whatever the tap
   * is about to open — a lazy chunk gets a head start of however long the tap
   * itself lasts, which is most of the time it needs.
   */
  onPointerDown?: () => void
  /** Named for a screen reader; the glyph carries it visually. */
  label: string
  children: ReactNode
}

/**
 * The persistent brick action, bottom-right, above the bottom bar and clear of
 * the home indicator (docs/03-DESIGN.md: "primary actions in the bottom third").
 *
 * One definition, because there is more than one screen whose primary action is
 * not "log an expense" — the mod board's is "add a mod" — and a second FAB drawn
 * by hand somewhere else is how two buttons that must look identical stop
 * being identical.
 */
export function Fab({ onClick, onPointerDown, label, children }: FabProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      onPointerDown={onPointerDown}
      className={[
        'fixed bottom-nav right-4 z-30 flex size-fab items-center justify-center',
        'rounded-full bg-accent text-accent-ink',
        'transition-transform duration-state ease-enter active:scale-[0.96]',
      ].join(' ')}
      style={{ marginBottom: 'calc(var(--space-4) + env(safe-area-inset-bottom))' }}
    >
      {children}
      <span className="sr-only">{label}</span>
    </button>
  )
}
