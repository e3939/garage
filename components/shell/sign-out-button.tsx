import { signOut } from '@/app/auth/actions'
import { ICON_UI, SignOut } from '@/components/icons'

export function SignOutButton() {
  return (
    <form action={signOut}>
      <button
        type="submit"
        className="flex min-h-touch items-center gap-2 rounded-md border border-border bg-surface px-3 text-label text-ink transition-colors duration-state ease-enter"
      >
        <SignOut {...ICON_UI} aria-hidden />
        Sign out
      </button>
    </form>
  )
}
