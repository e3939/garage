// Opens a sheet, so it owns open/closed state.
'use client'

import { useState } from 'react'

import { QuickAdd } from '@/components/expenses/quick-add'
import type { ExpenseFormProps } from '@/components/expenses/expense-form'
import { TimelineNoteForm } from '@/components/timeline/note-form'
import { Sheet } from '@/components/ui/sheet'

type VehicleFabProps = {
  quickAdd: Omit<ExpenseFormProps, 'mode' | 'initial' | 'onDone'>
  vehicleId: string
  userId: string
  lastReading: number
  locale: string
}

/**
 * The vehicle page's FAB: log an expense, or add a cost-free entry.
 *
 * The brick FAB keeps its job — it is the same control on every screen and
 * moving it would be a worse trade than any second action is worth — and the
 * secondary action sits directly above it as a labelled pill. Both are in the
 * bottom third of the screen and both clear 44px, so either is a thumb away
 * one-handed (docs/03-DESIGN.md).
 */
export function VehicleFab({ quickAdd, vehicleId, userId, lastReading, locale }: VehicleFabProps) {
  const [open, setOpen] = useState(false)

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="fixed right-4 z-30 flex min-h-touch items-center rounded-full border border-border-strong bg-surface px-4 text-label text-ink shadow-none"
        style={{
          bottom:
            'calc(var(--nav-height) + var(--space-4) + var(--fab-size) + var(--space-2) + env(safe-area-inset-bottom))',
        }}
      >
        Add note
      </button>

      <QuickAdd {...quickAdd} />

      <Sheet open={open} onClose={() => setOpen(false)} title="Add note">
        {open ? (
          <TimelineNoteForm
            mode="create"
            userId={userId}
            vehicleId={vehicleId}
            lastReading={lastReading}
            locale={locale}
            today={quickAdd.today}
            onDone={() => setOpen(false)}
          />
        ) : null}
      </Sheet>
    </>
  )
}
