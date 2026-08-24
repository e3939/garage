import type { Route } from 'next'
import {
  Car,
  ChartDonut,
  House,
  Receipt,
  SlidersHorizontal,
  type Icon,
} from '@/components/icons'

export type NavItem = {
  href: Route
  label: string
  icon: Icon
}

/**
 * The five destinations of the app, in the order they sit in the bottom bar.
 * Also the source of the header title, so a route only names itself once.
 */
export const NAV_ITEMS: readonly NavItem[] = [
  { href: '/today', label: 'Today', icon: House },
  { href: '/ledger', label: 'Ledger', icon: Receipt },
  { href: '/garage', label: 'Garage', icon: Car },
  { href: '/money', label: 'Money', icon: ChartDonut },
  { href: '/settings', label: 'Settings', icon: SlidersHorizontal },
]
