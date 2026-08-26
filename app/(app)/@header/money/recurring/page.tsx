import { AppHeader } from '@/components/shell/app-header'

export default function RecurringHeader() {
  return <AppHeader title="Recurring" back={{ href: '/money', label: 'Money' }} />
}
