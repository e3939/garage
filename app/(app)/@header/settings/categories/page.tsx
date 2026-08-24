import { AppHeader } from '@/components/shell/app-header'

export default function CategoriesHeader() {
  return <AppHeader title="Categories" back={{ href: '/settings', label: 'Settings' }} />
}
