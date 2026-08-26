import { AppHeader } from '@/components/shell/app-header'

export default function ExportHeader() {
  return <AppHeader title="Export" back={{ href: '/settings', label: 'Settings' }} />
}
