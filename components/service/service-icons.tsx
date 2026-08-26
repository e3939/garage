import type { ReactNode } from 'react'

import { Camera, ICON_UI, NoteBlank, Plus, Receipt, SealCheck, WarningCircle, Wrench } from '@/components/icons'

export type ServiceIcons = {
  /** Maintenance. The canonical glyph. */
  service: ReactNode
  /** Something is coming up. */
  due: ReactNode
  /** It was done. */
  done: ReactNode
  /** There is money against this record. */
  expense: ReactNode
  /** There are photos on this record. */
  photo: ReactNode
  /** There are words on this record. */
  note: ReactNode
  /** The screen's own action. */
  add: ReactNode
}

/**
 * Straight off the canonical mapping table in docs/03-DESIGN.md: service is a
 * `Wrench`, due soon is a `WarningCircle`, a thing that is done is a
 * `SealCheck`, money is a `Receipt`, a photo is a `Camera`, adding is a `Plus`.
 *
 * Drawn once on the server and handed down as elements, the way the ledger's
 * category icons and the board's are, so a schedule of a dozen rows does not put
 * a dozen Phosphor components in the client bundle.
 */
export function serviceIcons(): ServiceIcons {
  return {
    service: <Wrench {...ICON_UI} aria-hidden />,
    due: <WarningCircle {...ICON_UI} aria-hidden />,
    done: <SealCheck {...ICON_UI} aria-hidden />,
    expense: <Receipt {...ICON_UI} aria-hidden />,
    photo: <Camera {...ICON_UI} aria-hidden />,
    note: <NoteBlank {...ICON_UI} aria-hidden />,
    add: <Plus size={24} weight="bold" aria-hidden />,
  }
}
