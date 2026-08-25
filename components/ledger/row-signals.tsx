import type { ReactNode } from 'react'

import { Camera, ICON_UI, NoteBlank } from '@/components/icons'

/**
 * The two glyphs a ledger row can end with. Drawn once on the server and handed
 * down as elements, the same way category icons are, so the ledger's client
 * bundle still contains no Phosphor at all.
 */
export type LedgerSignalIcons = {
  note: ReactNode
  attachment: ReactNode
}

export function ledgerSignalIcons(): LedgerSignalIcons {
  return {
    note: <NoteBlank {...ICON_UI} aria-hidden />,
    attachment: <Camera {...ICON_UI} aria-hidden />,
  }
}
