import type { Metadata } from 'next'

import { catalogIconMap } from '@/components/icons/catalog'
import { CategoryManager } from '@/components/settings/category-manager'
import { fetchCategoriesForSettings } from '@/lib/queries/categories'

export const metadata: Metadata = { title: 'Categories' }

export default async function CategoriesSettingsPage() {
  const categories = await fetchCategoriesForSettings()

  return (
    <div className="space-y-4">
      <p className="text-body text-ink-muted">
        A category carries the two defaults every expense starts from: which bucket the money
        comes out of, and whether it counts toward the monthly budget. Either can be overridden
        on a single expense.
      </p>
      <CategoryManager categories={categories} icons={catalogIconMap()} />
    </div>
  )
}
