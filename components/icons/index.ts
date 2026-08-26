/**
 * The only place in the codebase that imports from @phosphor-icons/react.
 *
 * The list below is the canonical mapping table in docs/03-DESIGN.md, plus the
 * handful of chrome icons the shell needs. Adding an icon means adding a row to
 * that table first — improvising per screen is how an icon set stops being one.
 *
 * Regular weight at 20px for UI, Duotone at 24px for feature headers and empty
 * states. Never Fill: it reads as an emoji substitute.
 *
 * Icons come from the `dist/ssr` entry so they render in Server Components.
 * That entry has no IconContext, so `size` and `weight` are passed explicitly —
 * use the constants below rather than a literal.
 */
export type { Icon, IconProps, IconWeight } from '@phosphor-icons/react'

export {
  // --- Canonical mapping, docs/03-DESIGN.md
  GasPump, // Fuel
  Wrench, // Maintenance / service
  Gauge, // Mod / performance
  Car, // Vehicle
  CarProfile, // Vehicle, in the switcher
  Path, // Odometer / distance
  Receipt, // Money / expense
  ChartDonut, // Budget
  PiggyBank, // Fund
  Nut, // Part
  Camera, // Photo
  ClockCounterClockwise, // Timeline
  SealCheck, // Milestone
  LinkBreak, // Blocked dependency
  WarningCircle, // Due soon
  Plus, // Add
  NoteBlank, // A note is attached — ledger row signal, docs/03-DESIGN.md

  // --- Shell chrome. Navigation and account, nothing feature-specific.
  House, // Today
  SlidersHorizontal, // Settings
  SignOut, // Sign out
  PaperPlaneTilt, // Send the sign-in code
} from '@phosphor-icons/react/dist/ssr'

/** Regular weight at 20px for UI. */
export const ICON_UI = { size: 20, weight: 'regular' } as const

/** Duotone at 24px for feature headers, 32px for empty states. */
export const ICON_FEATURE = { size: 24, weight: 'duotone' } as const
export const ICON_EMPTY = { size: 32, weight: 'duotone' } as const
