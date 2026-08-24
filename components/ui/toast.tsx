// The toast queue is client state and its Undo runs a server action.
'use client'

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react'

/** docs/03-DESIGN.md: toasts live 2.4s. */
const TOAST_MS = 2400

export type Toast = {
  id: number
  message: string
  action?: { label: string; run: () => void }
}

type ToastApi = {
  show: (message: string, action?: Toast['action']) => void
}

const ToastContext = createContext<ToastApi | null>(null)

export function useToast(): ToastApi {
  const api = useContext(ToastContext)
  if (!api) throw new Error('useToast must be used inside <ToastProvider>')
  return api
}

/**
 * Bottom-centre, above the FAB, one at a time. An undo replaces the toast rather
 * than stacking a second one, because two toasts arguing about the same row is
 * worse than losing the first message.
 */
export function ToastProvider({ children }: { children: ReactNode }) {
  const [toast, setToast] = useState<Toast | null>(null)
  const nextId = useRef(0)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const show = useCallback((message: string, action?: Toast['action']) => {
    nextId.current += 1
    setToast({ id: nextId.current, message, action })
  }, [])

  useEffect(() => {
    if (!toast) return
    if (timer.current) clearTimeout(timer.current)
    timer.current = setTimeout(() => setToast(null), TOAST_MS)
    return () => {
      if (timer.current) clearTimeout(timer.current)
    }
  }, [toast])

  const api = useMemo(() => ({ show }), [show])

  return (
    <ToastContext.Provider value={api}>
      {children}
      <div
        aria-live="polite"
        className="pointer-events-none fixed inset-x-0 z-40 flex justify-center px-4"
        style={{
          bottom: 'calc(var(--nav-height) + var(--space-6) + env(safe-area-inset-bottom))',
        }}
      >
        {toast ? (
          <div
            key={toast.id}
            className="pointer-events-auto flex max-w-content items-center gap-4 rounded-md border border-border-strong bg-surface px-4 py-3"
          >
            <p className="text-label text-ink">{toast.message}</p>
            {toast.action ? (
              <button
                type="button"
                className="min-h-touch shrink-0 text-label font-medium text-accent"
                onClick={() => {
                  toast.action?.run()
                  setToast(null)
                }}
              >
                {toast.action.label}
              </button>
            ) : null}
          </div>
        ) : null}
      </div>
    </ToastContext.Provider>
  )
}
