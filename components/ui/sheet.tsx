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

  /**
   * Lock the page behind the sheet.
   *
   * `showModal()` makes the document inert, which stops it being clicked but
   * not reliably scrolled. That was invisible until a sheet opened over the mod
   * board, which is a horizontally snapping carousel five columns wide: the
   * board panned sideways underneath, and because the sheet is fixed to a
   * viewport that moves with it on iOS, the whole sheet appeared to slide and
   * its fields ran off the right edge. The sheet was never too wide.
   *
   * Both axes, because the vertical case is the same bug with less to notice:
   * the page scrolling away behind a form is how a sheet stops reading as a
   * sheet.
   */
  useEffect(() => {
    if (!open) return
    const root = document.documentElement
    const previous = { overflow: root.style.overflow, overscroll: root.style.overscrollBehavior }
    root.style.overflow = 'hidden'
    root.style.overscrollBehavior = 'none'
    return () => {
      root.style.overflow = previous.overflow
      root.style.overscrollBehavior = previous.overscroll
    }
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
