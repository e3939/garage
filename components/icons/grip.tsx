/**
 * The drag handle.
 *
 * Drawn by hand rather than taken from Phosphor because the canonical mapping
 * table in docs/03-DESIGN.md has no row for "drag", and adding one is a change
 * to that document rather than to this component (CLAUDE.md section 1 allows an
 * inline SVG in `components/icons/` exactly here). Six dots in two columns, the
 * shape every board on every platform uses, at the same 20px the rest of the UI
 * icon set sits at.
 *
 * No Phosphor import, so a client component may use it directly.
 */
export function Grip({ size = 20 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 20 20"
      fill="currentColor"
      aria-hidden
      focusable="false"
    >
      <circle cx="7.5" cy="5" r="1.4" />
      <circle cx="12.5" cy="5" r="1.4" />
      <circle cx="7.5" cy="10" r="1.4" />
      <circle cx="12.5" cy="10" r="1.4" />
      <circle cx="7.5" cy="15" r="1.4" />
      <circle cx="12.5" cy="15" r="1.4" />
    </svg>
  )
}
