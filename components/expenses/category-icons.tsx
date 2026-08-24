import type { ReactNode } from 'react'

import { CategoryIcon } from '@/components/icons/catalog'
import { ICON_UI } from '@/components/icons'
import type { CategoryOption } from '@/lib/expenses/types'

/**
 * Draw each category's icon once, on the server, and hand the elements to the
 * client components that need them.
 *
 * Rendering a name into a component requires the whole catalogue to be reachable
 * from wherever that happens. Doing it here keeps the catalogue in the server
 * bundle: the ledger and the quick-add sheet receive finished SVG and never
 * import Phosphor at all.
 */
export function categoryIconMap(
  categories: readonly CategoryOption[],
  size: number = ICON_UI.size,
): Record<string, ReactNode> {
  const map: Record<string, ReactNode> = {}
  for (const category of categories) {
    if (!map[category.icon]) {
      map[category.icon] = <CategoryIcon name={category.icon} size={size} />
    }
  }
  return map
}
