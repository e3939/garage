// A grid the user taps through.
'use client'

import type { ReactNode } from 'react'

import { ICON_GROUPS } from '@/components/icons/catalog-names'

type IconPickerProps = {
  value: string
  onChange: (name: string) => void
  /** Drawn behind the selected glyph so the choice is seen in its own colour. */
  colour: string
  /** The whole catalogue, rendered by the Server Component that owns the page. */
  icons: Record<string, ReactNode>
}

/**
 * The icons a category can wear, grouped so it reads as a list rather than a
 * wall. Only the names are imported here; the glyphs arrive already drawn, which
 * is what keeps ninety Phosphor modules out of this route's JavaScript.
 */
export function IconPicker({ value, onChange, colour, icons }: IconPickerProps) {
  return (
    <div className="space-y-4">
      {ICON_GROUPS.map((group) => (
        <div key={group.label} className="space-y-2">
          <p className="text-eyebrow font-display uppercase text-ink-muted">{group.label}</p>
          <div className="flex flex-wrap gap-2">
            {group.names.map((name) => {
              const selected = name === value
              return (
                <button
                  key={name}
                  type="button"
                  aria-pressed={selected}
                  aria-label={name}
                  onClick={() => onChange(name)}
                  className="flex size-touch items-center justify-center rounded-md border"
                  style={{
                    borderColor: selected ? colour : 'var(--border)',
                    backgroundColor: selected ? colour : 'var(--surface)',
                    color: selected ? 'var(--accent-ink)' : 'var(--text-muted)',
                  }}
                >
                  {icons[name] ?? null}
                </button>
              )
            })}
          </div>
        </div>
      ))}
    </div>
  )
}
