import { AppHeader } from '@/components/shell/app-header'

export default function ImportHeader() {
  return <AppHeader title="Import" back={{ href: '/settings', label: 'Settings' }} />
}
