/**
 * The icons a category may carry.
 *
 * `categories.icon` stores a Phosphor name as text, so something has to turn that
 * text back into a component. A full barrel import would be every icon in the
 * package; this is the subset the picker offers and therefore the only subset a
 * stored name can be. Adding a row here is what makes a new icon choosable.
 *
 * Rendered server-side wherever possible — the ledger and the quick-add chips
 * receive already-rendered elements from a Server Component, so this module and
 * its icons stay out of those route bundles.
 */
import {
  Airplane,
  Bandaids,
  Bank,
  Barbell,
  Basket,
  Bed,
  Bicycle,
  Book,
  Briefcase,
  Broom,
  Buildings,
  Bus,
  Cake,
  Camera,
  Car,
  CarProfile,
  ChargingStation,
  ChartDonut,
  ClockCounterClockwise,
  Coffee,
  Coins,
  Confetti,
  CookingPot,
  CreditCard,
  Dog,
  DotsThree,
  Drop,
  Engine,
  Eyeglasses,
  FilmSlate,
  FirstAidKit,
  Flag,
  ForkKnife,
  GameController,
  Garage,
  GasPump,
  Gauge,
  Gift,
  GraduationCap,
  Hammer,
  Handbag,
  HandCoins,
  Headphones,
  Heartbeat,
  House,
  Invoice,
  Key,
  Leaf,
  Lightbulb,
  Lightning,
  MapPin,
  Motorcycle,
  MusicNotes,
  Nut,
  Package,
  Path,
  PawPrint,
  Phone,
  PiggyBank,
  Pill,
  Plant,
  Receipt,
  RoadHorizon,
  Scissors,
  Scooter,
  Screwdriver,
  SealCheck,
  ShieldCheck,
  ShoppingBagOpen,
  ShoppingCart,
  Snowflake,
  Sparkle,
  SteeringWheel,
  Storefront,
  Suitcase,
  Ticket,
  Timer,
  Tire,
  Toolbox,
  Train,
  Tree,
  Trophy,
  Truck,
  TShirt,
  Umbrella,
  Wallet,
  WarningCircle,
  WashingMachine,
  Wine,
  Wrench,
} from '@phosphor-icons/react/dist/ssr'
import type { ReactNode } from 'react'

import type { Icon } from '@phosphor-icons/react'

import { ICON_UI } from '@/components/icons'
import { FALLBACK_ICON_NAME, ICON_NAMES } from '@/components/icons/catalog-names'

const CATALOG: Readonly<Record<string, Icon>> = {
  Airplane,
  Bandaids,
  Bank,
  Barbell,
  Basket,
  Bed,
  Bicycle,
  Book,
  Briefcase,
  Broom,
  Buildings,
  Bus,
  Cake,
  Camera,
  Car,
  CarProfile,
  ChargingStation,
  ChartDonut,
  ClockCounterClockwise,
  Coffee,
  Coins,
  Confetti,
  CookingPot,
  CreditCard,
  Dog,
  DotsThree,
  Drop,
  Engine,
  Eyeglasses,
  FilmSlate,
  FirstAidKit,
  Flag,
  ForkKnife,
  GameController,
  Garage,
  GasPump,
  Gauge,
  Gift,
  GraduationCap,
  Hammer,
  HandCoins,
  Handbag,
  Headphones,
  Heartbeat,
  House,
  Invoice,
  Key,
  Leaf,
  Lightbulb,
  Lightning,
  MapPin,
  Motorcycle,
  MusicNotes,
  Nut,
  Package,
  Path,
  PawPrint,
  Phone,
  PiggyBank,
  Pill,
  Plant,
  Receipt,
  RoadHorizon,
  Scissors,
  Scooter,
  Screwdriver,
  SealCheck,
  ShieldCheck,
  ShoppingBagOpen,
  ShoppingCart,
  Snowflake,
  Sparkle,
  SteeringWheel,
  Storefront,
  Suitcase,
  TShirt,
  Ticket,
  Timer,
  Tire,
  Toolbox,
  Train,
  Tree,
  Trophy,
  Truck,
  Umbrella,
  Wallet,
  WarningCircle,
  WashingMachine,
  Wine,
  Wrench,
}

export function isKnownIconName(name: string): boolean {
  return Object.hasOwn(CATALOG, name)
}

type CategoryIconProps = {
  name: string
  size?: number
  weight?: 'regular' | 'duotone'
  className?: string
  style?: React.CSSProperties
}

/**
 * Renders a category's stored icon name. An unknown name falls back to the
 * receipt rather than rendering nothing, so a category imported from elsewhere
 * still has a shape in the list.
 */
export function CategoryIcon({
  name,
  size = ICON_UI.size,
  weight = 'regular',
  className,
  style,
}: CategoryIconProps) {
  const Glyph = CATALOG[name] ?? CATALOG[FALLBACK_ICON_NAME] ?? Receipt
  return <Glyph size={size} weight={weight} className={className} style={style} aria-hidden />
}

/**
 * Every catalogue icon, drawn once on the server.
 *
 * The picker is interactive, so it is a Client Component; without this it would
 * have to import the catalogue and ship ninety icon modules — around eighty
 * kilobytes gzipped — to render a grid that never changes. Handing it finished
 * elements moves that into the RSC payload, where it costs bytes but no parse
 * and no execution.
 */
export function catalogIconMap(size: number = ICON_UI.size): Record<string, ReactNode> {
  const map: Record<string, ReactNode> = {}
  for (const name of ICON_NAMES) {
    map[name] = <CategoryIcon name={name} size={size} />
  }
  return map
}
