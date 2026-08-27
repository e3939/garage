import type { ReactNode } from 'react'

import {
  Camera,
  GasPump,
  Gauge,
  ICON_UI,
  NoteBlank,
  Receipt,
  SealCheck,
  Wrench,
} from '@/components/icons'
import type { TimelineKind } from '@/lib/timeline/types'

export type TimelineKindIcons = Readonly<Record<TimelineKind, ReactNode>>

/**
 * One glyph per kind of thing that happens to a car, straight off the canonical
 * mapping table in docs/03-DESIGN.md: an expense is a `Receipt`, a mod is a
 * `Gauge`, service is a `Wrench`, fuel is a `GasPump`, a milestone is a
 * `SealCheck`. A timeline note is a `NoteBlank`, which the ledger already uses
 * to mean "there are words here". A gallery photo is the canonical `Camera`.
 *
 * Drawn once on the server and handed to the feed as elements, the same way the
 * ledger's category icons and row signals are, so the feed's client bundle holds
 * no Phosphor at all.
 */
export function timelineKindIcons(): TimelineKindIcons {
  return {
    expense: <Receipt {...ICON_UI} aria-hidden />,
    mod: <Gauge {...ICON_UI} aria-hidden />,
    service: <Wrench {...ICON_UI} aria-hidden />,
    fuel: <GasPump {...ICON_UI} aria-hidden />,
    milestone: <SealCheck {...ICON_UI} aria-hidden />,
    note: <NoteBlank {...ICON_UI} aria-hidden />,
    gallery: <Camera {...ICON_UI} aria-hidden />,
  }
}
