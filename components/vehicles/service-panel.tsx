import { Wrench, ICON_UI } from '@/components/icons'

/**
 * The fourth figure on the vehicle home is "next service due", and the schedule,
 * the due calculation and the gauge are all roadmap Phase 6.
 *
 * So the panel is here, in its final position and at its final size, saying
 * exactly what it knows: nothing yet. A screen with three figures and a gap is a
 * screen that looks broken; a screen with four panels, one of which says it is
 * not set up, looks like a car whose service book has not been filled in — which
 * is what it is.
 *
 * "A due item on the vehicle home shows as a small gauge, not a red banner.
 *  Nagging is rude." (docs/01-PRODUCT.md.) Nothing here nags either.
 */
export function ServicePanel() {
  return (
    <section className="panel-sunken rounded-md px-3 py-3">
      <p className="text-label text-ink">Next service</p>
      <p className="text-eyebrow font-display uppercase text-ink-muted">Schedule</p>
      <p className="mt-1 flex items-center gap-2 text-odometer text-ink-faint">
        <Wrench {...ICON_UI} aria-hidden />
        <span className="text-body">Not set up</span>
      </p>
      <p className="mt-2 text-caption text-ink-muted">
        Service intervals and the due gauge arrive in Phase 6.
      </p>
    </section>
  )
}
