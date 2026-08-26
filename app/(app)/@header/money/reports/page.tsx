import { AppHeader } from '@/components/shell/app-header'

export default function ReportsHeader() {
  return <AppHeader title="Reports" back={{ href: '/money', label: 'Money' }} />
}
