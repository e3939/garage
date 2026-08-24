import type { Metadata } from 'next'
import { Placeholder } from '@/components/shell/placeholder'
import { Receipt } from '@/components/icons'

export const metadata: Metadata = { title: 'Ledger' }

export default function LedgerPage() {
  return (
    <Placeholder
      icon={Receipt}
      heading="No expenses yet"
      body="The ledger, search and filters arrive in Phase 2."
    />
  )
}
