// Chip selection is form state.
'use client'

import { useMemo, type ReactNode } from 'react'
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
 * The second and last tap of the default flow.
 *
 * Grouped by bucket, then ranked within the group. Life first because it is the
 * everyday spend — the thing being logged while standing in a shop — and car
 * spend is deliberate enough that it gets looked for. The order inside each
 * group is still `v_categories_ranked`, most recently used first, so the
 * ranking is not lost; it is applied one level down.
 *
 * Both car buckets share a group. Splitting `car_running` from `car_project`
 * would put three headings above fourteen chips, and the running/project
 * distinction is already carried by the bucket chip further down the form,
 * where it can be overridden.
 *
 * The partition is stable, so a category never moves within its group.
 */
export function CategoryChips({ categories, icons, value, onChange }: CategoryChipsProps) {
  const groups = useMemo(() => {
    const life = categories.filter((category) => category.default_bucket === 'life')
    const car = categories.filter((category) => category.default_bucket !== 'life')
    return [
      { key: 'life', label: 'Life', items: life },
      { key: 'car', label: 'Car', items: car },
    ].filter((group) => group.items.length > 0)
  }, [categories])

  return (
    <div className="space-y-2" role="group" aria-label="Category">
      {groups.map((group) => (
        <div key={group.key} className="space-y-1">
          {groups.length > 1 ? (
            <p className="text-eyebrow font-display uppercase text-ink-faint">{group.label}</p>
          ) : null}
          <div className="flex flex-wrap gap-1">
            {group.items.map((category) => (
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
        </div>
      ))}
    </div>
  )
}
