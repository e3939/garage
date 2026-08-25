import type { ReactNode } from 'react'

import { Money } from '@/components/ui/money'

type Emphasis = 'hero' | 'panel'

type StatProps = {
  /**
   * Which of the three views this figure is showing, or — for a figure that is
   * only ever one of them, like a lifetime total — which one that is.
   *
   * Not optional, deliberately. docs/01-PRODUCT.md: "Never show a total without
   * the view label next to it. Ambiguity here destroys the whole point." Making
   * it a required prop is how that survives the next person in a hurry.
   */
  view: string
  /** What the figure is of: "August 2026", "Lifetime", "Since purchase". */
  context?: string
  /** The name of the figure itself, when the label is not enough: "Cost per km". */
  name?: string
  emphasis?: Emphasis
  caption?: ReactNode
  children: ReactNode
}

/**
 * A figure on the odometer strip: a recessed panel with hairline rules, the
 * label above in eyebrow caps, the number in tabular mono (docs/03-DESIGN.md,
 * signature element 1). The digits do not roll yet — that is roadmap Phase 8 —
 * but the bed they will roll on is here.
 *
 * `hero` is the one big figure a screen is allowed. `panel` is everything else.
 */
export function Stat({
  view,
  context,
  name,
  emphasis = 'panel',
  caption,
  children,
}: StatProps) {
  const hero = emphasis === 'hero'

  return (
    <section
      className={['panel-sunken rounded-md', hero ? 'px-4 py-5' : 'px-3 py-3'].join(' ')}
    >
      {name ? <p className="text-label text-ink">{name}</p> : null}
      <p className="text-eyebrow font-display uppercase text-ink-muted">
        {view}
        {context ? <span className="text-ink-faint">{` · ${context}`}</span> : null}
      </p>
      <div className={hero ? 'mt-2' : 'mt-1'}>{children}</div>
      {caption ? <p className="mt-2 text-caption text-ink-muted">{caption}</p> : null}
    </section>
  )
}

type TotalProps = Omit<StatProps, 'children'> & {
  /** Minor units. Null renders an em dash rather than a zero. */
  amount: number | null
  currency: string
  locale: string
  /** Appended inside the figure: "/km". Part of the number, so it stays mono. */
  suffix?: string
}

/** A money figure with its view label. The only way to render a total. */
export function Total({
  amount,
  currency,
  locale,
  suffix,
  emphasis = 'panel',
  ...stat
}: TotalProps) {
  const size = emphasis === 'hero' ? 'odometer-lg' : 'odometer'

  return (
    <Stat emphasis={emphasis} {...stat}>
      {amount === null ? (
        // Written out rather than interpolated: Tailwind scans for whole class
        // names, and `text-${size}` is a class that never gets generated.
        <span
          className={[
            'font-mono text-ink-faint',
            emphasis === 'hero' ? 'text-odometer-lg' : 'text-odometer',
          ].join(' ')}
          aria-label="Not enough data yet"
        >
          &mdash;
        </span>
      ) : (
        <span className="inline-flex items-baseline">
          <Money amount={amount} currency={currency} locale={locale} size={size} />
          {suffix ? <span className="font-mono text-label text-ink-muted">{suffix}</span> : null}
        </span>
      )}
    </Stat>
  )
}
