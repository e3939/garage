// Changing the view rewrites the URL and records the choice on the profile.
'use client'

import { startTransition } from 'react'
import { usePathname, useRouter } from 'next/navigation'

import { setDefaultViewAction } from '@/app/(app)/preferences/actions'
import {
  SPEND_VIEWS,
  SPEND_VIEW_LABEL,
  SPEND_VIEW_PARAM,
  type SpendView,
} from '@/lib/views'

type ViewSwitcherProps = {
  view: SpendView
  /**
   * The rest of the query string, so switching the view on a filtered screen
   * keeps the filters. Serialised on the server; this component never reads the
   * URL itself, which keeps it out of the Suspense rules around
   * `useSearchParams`.
   */
  search?: string
}

/**
 * Monthly / All-in / Car only, as a segmented control pinned under the header
 * (docs/03-DESIGN.md). Its state lives in the URL, so a view is shareable and
 * survives a refresh, and it is written back to `profiles.default_view` so the
 * next screen opens on the same one.
 *
 * `replace`, not `push`: flipping between the three views four times and then
 * pressing back should leave the screen, not walk backwards through four
 * readings of the same month.
 *
 * The write to the profile is fire-and-forget inside a transition. If it fails,
 * the URL still carries the view and the screen is still correct — the only cost
 * is that tomorrow opens on the old default, which is not worth a toast.
 */
export function ViewSwitcher({ view, search = '' }: ViewSwitcherProps) {
  const router = useRouter()
  const pathname = usePathname()

  function select(next: SpendView) {
    if (next === view) return

    const params = new URLSearchParams(search)
    params.delete(SPEND_VIEW_PARAM)
    params.set(SPEND_VIEW_PARAM, next)
    router.replace(`${pathname}?${params.toString()}`, { scroll: false })

    startTransition(async () => {
      await setDefaultViewAction(next)
    })
  }

  return (
    <div
      role="group"
      aria-label="Which total to show"
      className="panel-sunken flex w-full gap-1 rounded-full p-1"
    >
      {SPEND_VIEWS.map((entry) => {
        const selected = entry === view
        return (
          <button
            key={entry}
            type="button"
            onClick={() => select(entry)}
            aria-pressed={selected}
            className={[
              'min-h-touch flex-1 rounded-full border px-3 text-label',
              'transition-colors duration-state ease-enter',
              selected
                ? 'border-border-strong bg-surface font-medium text-ink'
                : 'border-transparent text-ink-muted',
            ].join(' ')}
          >
            {SPEND_VIEW_LABEL[entry]}
          </button>
        )
      })}
    </div>
  )
}
