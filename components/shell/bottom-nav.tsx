// Needs the active pathname to mark the current destination.
'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { ICON_UI } from '@/components/icons'
import { NAV_ITEMS } from '@/components/shell/nav-items'

function isActive(pathname: string, href: string): boolean {
  return pathname === href || pathname.startsWith(`${href}/`)
}

export function BottomNav() {
  const pathname = usePathname()

  return (
    <nav
      aria-label="Sections"
      className="fixed inset-x-0 bottom-0 z-20 border-t border-border bg-surface pb-[env(safe-area-inset-bottom)]"
    >
      <ul className="safe-x mx-auto flex h-nav max-w-content items-stretch">
        {NAV_ITEMS.map(({ href, label, icon: Icon }) => {
          const active = isActive(pathname, href)
          return (
            <li key={href} className="flex-1">
              <Link
                href={href}
                aria-current={active ? 'page' : undefined}
                className={[
                  'flex h-full min-h-touch flex-col items-center justify-center gap-1',
                  'text-caption transition-colors duration-state ease-enter',
                  active ? 'text-accent' : 'text-ink-muted',
                ].join(' ')}
              >
                <Icon {...ICON_UI} weight={active ? 'duotone' : 'regular'} aria-hidden />
                <span>{label}</span>
              </Link>
            </li>
          )
        })}
      </ul>
    </nav>
  )
}
