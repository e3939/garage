import { AppHeader } from '@/components/shell/app-header'

/** Fallback for any route that has not filled the header slot. */
export default function DefaultHeader() {
  return <AppHeader title="Garage" />
}
