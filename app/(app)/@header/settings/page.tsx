import { AppHeader } from '@/components/shell/app-header'
import { SignOutButton } from '@/components/shell/sign-out-button'

export default function SettingsHeader() {
  return <AppHeader title="Settings" actions={<SignOutButton />} />
}
