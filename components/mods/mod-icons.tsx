import type { ReactNode } from 'react'

import { Camera, Gauge, ICON_UI, LinkBreak, Plus, SealCheck } from '@/components/icons'

export type ModIcons = {
  /** A mod. The canonical glyph for "mod / performance". */
  mod: ReactNode
  /** Dependencies that are not on the car yet. */
  blocked: ReactNode
  /** There are inspiration photos on this card. */
  photo: ReactNode
  /** On the car. */
  installed: ReactNode
  /** The board's own action. */
  add: ReactNode
}

/**
 * The board's glyphs, straight off the canonical mapping table in
 * docs/03-DESIGN.md: a mod is a `Gauge`, a blocked dependency is a `LinkBreak`,
 * a photo is a `Camera`, a thing that is done is a `SealCheck`, adding is a
 * `Plus`.
 *
 * Drawn once on the server and handed to the board as elements, the way the
 * ledger's category icons and the feed's kind icons are, so a board of twenty
 * cards does not put twenty Phosphor components in the client bundle.
 */
export function modIcons(): ModIcons {
  return {
    mod: <Gauge {...ICON_UI} aria-hidden />,
    blocked: <LinkBreak {...ICON_UI} aria-hidden />,
    photo: <Camera {...ICON_UI} aria-hidden />,
    installed: <SealCheck {...ICON_UI} aria-hidden />,
    add: <Plus size={24} weight="bold" aria-hidden />,
  }
}
