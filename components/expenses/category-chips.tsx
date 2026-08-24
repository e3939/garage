// Chip selection is form state.
'use client'

import type { ReactNode } from 'react'
import { Chip } from '@/components/ui/chip'
import type { CategoryOption } from '@/lib/expenses/types'

type CategoryChipsProps = {
  categories: readonly CategoryOption[]
  /** Icons are rendered by a Server Component and handed over already drawn. */
  icons: Record<string, ReactNode>
  value: string
  onChange: (categoryId: string) => void
}

/**
 * The second and last tap of the default flow. Order comes from
 * `v_categories_ranked` — most recently used first — so the chip you want is
 * almost always in the first row.
 */
export function CategoryChips({ categories, icons, value, onChange }: CategoryChipsProps) {
  return (
    <div className="flex flex-wrap gap-2" role="group" aria-label="Category">
      {categories.map((category) => (
        <Chip
          key={category.id}
          selected={value === category.id}
          accent={category.colour_hex}
          onSelect={() => onChange(value === category.id ? '' : category.id)}
        >
          {icons[category.icon] ?? null}
          {category.name}
        </Chip>
      ))}
    </div>
  )
}
