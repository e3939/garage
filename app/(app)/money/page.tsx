import type { Metadata } from 'next'
import { Placeholder } from '@/components/shell/placeholder'
import { ChartDonut } from '@/components/icons'

export const metadata: Metadata = { title: 'Money' }

export default function MoneyPage() {
  return (
    <Placeholder
      icon={ChartDonut}
      heading="No budget set"
      body="Budgets, funds and reports arrive in Phase 7."
    />
  )
}
