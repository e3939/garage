import type { ReactNode } from 'react'

type ChipProps = {
  selected: boolean
  onSelect: () => void
  children: ReactNode
  /** Drawn as the chip's outline and, when selected, its fill. */
  accent?: string
  className?: string
  title?: string
}

/**
 * Small, outlined, always carrying its own colour (docs/03-DESIGN.md). Colour
 * never carries meaning alone, so a chip always has text in it too.
 */
export function Chip({ selected, onSelect, children, accent, className = '', title }: ChipProps) {
  return (
    <button
      type="button"
      onClick={onSelect}
      aria-pressed={selected}
      title={title}
      className={[
        'inline-flex min-h-touch items-center gap-2 rounded-full border px-3 text-label',
        'transition-colors duration-state ease-enter',
        selected ? 'font-medium' : 'bg-surface',
        className,
      ].join(' ')}
      style={{
        borderColor: accent ?? 'var(--border-strong)',
        color: selected ? 'var(--accent-ink)' : (accent ?? 'var(--text)'),
        backgroundColor: selected ? (accent ?? 'var(--accent)') : undefined,
      }}
    >
      {children}
    </button>
  )
}
