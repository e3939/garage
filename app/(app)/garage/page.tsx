import type { Metadata } from 'next'
import { Placeholder } from '@/components/shell/placeholder'
import { Car } from '@/components/icons'

export const metadata: Metadata = { title: 'Garage' }

export default function GaragePage() {
  return (
    <Placeholder
      icon={Car}
      heading="No vehicles yet"
      body="Vehicles, the spec strip and the view switcher arrive in Phase 3."
    />
  )
}
