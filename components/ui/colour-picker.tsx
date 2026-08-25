// Swatch selection is state.
'use client'

/**
 * The palette is the design system's, not a colour wheel: the five Firenze
 * colours plus the two neutrals that read on paper. A category is allowed a
 * colour outside it, but it has to be typed rather than stumbled into.
 */
const SWATCHES: readonly { hex: string; name: string }[] = [
  { hex: '#578769', name: 'Ink green' },
  { hex: '#A95031', name: 'Brick' },
  { hex: '#833012', name: 'Ember' },
  { hex: '#F4B354', name: 'Amber' },
  { hex: '#6B6357', name: 'Soft ink' },
  { hex: '#9A9084', name: 'Faint ink' },
  { hex: '#2A2620', name: 'Ink' },
]

type ColourPickerProps = {
  value: string
  onChange: (hex: string) => void
}

export function ColourPicker({ value, onChange }: ColourPickerProps) {
  const upper = value.toUpperCase()

  return (
    <div className="flex flex-wrap items-center gap-2">
      {SWATCHES.map((swatch) => (
        <button
          key={swatch.hex}
          type="button"
          aria-label={swatch.name}
          aria-pressed={upper === swatch.hex}
          onClick={() => onChange(swatch.hex)}
          className="size-touch rounded-md border-2"
          style={{
            backgroundColor: swatch.hex,
            borderColor: upper === swatch.hex ? 'var(--text)' : 'transparent',
          }}
        />
      ))}
      <label className="flex min-h-touch items-center gap-2 text-caption text-ink-muted">
        <span>Other</span>
        <input
          type="color"
          value={value}
          onChange={(event) => onChange(event.target.value.toUpperCase())}
          className="size-8 cursor-pointer rounded-sm border border-border bg-surface"
        />
      </label>
    </div>
  )
}
