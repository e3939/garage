import { ICON_EMPTY, type Icon } from '@/components/icons'

type PlaceholderProps = {
  icon: Icon
  heading: string
  body: string
}

/**
 * Phase 0 stand-in for real screen content. Shaped like the empty state in
 * docs/03-DESIGN.md — Duotone icon at 32px, one sentence of direction — minus
 * the button, because there is nothing to do here yet.
 */
export function Placeholder({ icon: Icon, heading, body }: PlaceholderProps) {
  return (
    <section className="flex flex-col items-start gap-3 rounded-md border border-border bg-surface p-6">
      <Icon {...ICON_EMPTY} className="text-ink-faint" aria-hidden />
      <h2 className="text-title text-ink">{heading}</h2>
      <p className="text-body text-ink-muted">{body}</p>
    </section>
  )
}
