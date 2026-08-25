import type { ReactNode } from 'react'

import { Camera, ICON_UI, NoteBlank, WarningCircle } from '@/components/icons'

/**
 * The two glyphs a ledger row can end with. Drawn once on the server and handed
 * down as elements, the same way category icons are, so the ledger's client
 * bundle still contains no Phosphor at all.
 */
export type LedgerSignalIcons = {
  note: ReactNode
  attachment: ReactNode
  /** The reading on this row is below the vehicle's last known one. */
  lowOdometer: ReactNode
}

export function ledgerSignalIcons(): LedgerSignalIcons {
  return {
    note: <NoteBlank {...ICON_UI} aria-hidden />,
    attachment: <Camera {...ICON_UI} aria-hidden />,
    lowOdometer: <WarningCircle {...ICON_UI} aria-hidden />,
  }
}
