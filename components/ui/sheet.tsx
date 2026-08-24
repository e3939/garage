// A modal needs open/close state, escape handling and a ref to the dialog.
'use client'

import { useEffect, useRef, type ReactNode } from 'react'

type SheetProps = {
  open: boolean
  onClose: () => void
  title: string
  /** Right-hand slot in the sheet's own header — usually Delete. */
  action?: ReactNode
  children: ReactNode
}

/**
 * The bottom sheet, on a native `<dialog>`.
 *
 * `showModal()` brings the focus trap, the escape key, the inert background and
 * the backdrop with it, which is a lot of accessibility for no bundle. Position
 * and motion come from the `.sheet` rules in globals.css: bottom on mobile,
 * fade and scale on desktop, opacity only under reduced motion.
 */
export function Sheet({ open, onClose, title, action, children }: SheetProps) {
  const ref = useRef<HTMLDialogElement>(null)

  useEffect(() => {
    const dialog = ref.current
    if (!dialog) return
    if (open && !dialog.open) dialog.showModal()
    if (!open && dialog.open) dialog.close()
  }, [open])

  return (
    <dialog
      ref={ref}
      className="sheet"
      aria-label={title}
      onClose={onClose}
      onCancel={(event) => {
        event.preventDefault()
        onClose()
      }}
      onClick={(event) => {
        // A click that lands on the dialog element itself is a click on the
        // backdrop: the content sits in the form/div below and stops there.
        if (event.target === ref.current) onClose()
      }}
    >
      <div className="flex max-h-[88dvh] flex-col">
        <header className="flex items-center justify-between gap-4 border-b border-border px-4 py-3">
          <h2 className="font-display text-title text-ink">{title}</h2>
          <div className="flex items-center gap-2">
            {action}
            <button
              type="button"
              onClick={onClose}
              className="min-h-touch rounded-md px-3 text-label text-ink-muted"
            >
              Close
            </button>
          </div>
        </header>
        {children}
      </div>
    </dialog>
  )
}
