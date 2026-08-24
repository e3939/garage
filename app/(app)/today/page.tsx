import type { Metadata } from 'next'
import { Placeholder } from '@/components/shell/placeholder'
import { Receipt } from '@/components/icons'

export const metadata: Metadata = { title: 'Today' }

export default function TodayPage() {
  return (
    <Placeholder
      icon={Receipt}
      heading="Nothing logged yet"
      body="Quick add and the month-at-a-glance panel arrive in Phase 2."
    />
  )
}
