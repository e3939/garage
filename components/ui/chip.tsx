import type { ReactNode } from 'react'

type ChipProps = {
  selected: boolean
  onSelect: () => void
  children: ReactNode
  /** Drawn as the chip's outline and, when selected, its tint and its ink. */
  accent?: string
  /** Unreachable rather than merely unchosen. Says so in shape, not in opacity. */
  disabled?: boolean
  className?: string
  title?: string
}

/**
 * Small, outlined, always carrying its own colour (docs/03-DESIGN.md). Colour
 * never carries meaning alone, so a chip always has text in it too.
 *
 * Three states, and they have to be told apart at arm's length on a phone:
 *
 * - **unselected** — hairline outline in the chip's own colour, paper behind it.
 * - **selected** — the same colour doubled into a ring, a wash of it behind the
 *   text, and the label set in it. Filling the chip solid was the old treatment
 *   and it made every current state shout as loudly as the Save button.
 * - **disabled** — sunken paper, a dashed outline, faint ink. Dashed is the part
 *   that matters: faintness alone reads as "not chosen", not as "cannot be".
 *
 * The ring is an inset shadow rather than a second pixel of border, so nothing
 * moves when the selection does.
 *
 * `--r-sm`, not a pill. Fourteen fully-rounded chips read as a bag of sweets
 * and took most of the quick-add sheet; 6px on a 44px-tall element is crisp,
 * and it sits under the 10px of the inputs above it, which is the right way
 * round — the larger the surface, the larger the radius. The height still
 * clears the 44px touch floor; only the horizontal padding came in.
 */
export function Chip({
  selected,
  onSelect,
  children,
  accent,
  disabled = false,
  className = '',
  title,
}: ChipProps) {
  const colour = accent ?? 'var(--accent)'

  return (
    <button
      type="button"
      onClick={onSelect}
      disabled={disabled}
      aria-pressed={selected}
      title={title}
      className={[
        'inline-flex min-h-touch items-center gap-1 rounded-sm border px-2 text-label',
        'transition-colors duration-state ease-enter',
        selected ? 'font-medium' : '',
        disabled ? 'border-dashed border-border-strong bg-surface-sunken text-ink-faint' : 'bg-surface',
        className,
      ].join(' ')}
      style={
        disabled
          ? undefined
          : {
              borderColor: colour,
              color: colour,
              backgroundColor: selected
                ? `color-mix(in srgb, ${colour} 14%, var(--surface))`
                : undefined,
              boxShadow: selected ? `inset 0 0 0 1px ${colour}` : undefined,
            }
      }
    >
      {children}
    </button>
  )
}
