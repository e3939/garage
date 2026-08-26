import { Odometer } from '@/components/ui/odometer'
import { formatMoney } from '@/lib/money'

type MoneyProps = {
  /** Minor units. */
  amount: number
  currency?: string
  locale?: string
  /** `odometer` for row amounts, `odometer-lg` for the one hero figure. */
  size?: 'odometer' | 'odometer-lg' | 'body' | 'label'
  className?: string
  signDisplay?: 'auto' | 'always' | 'never' | 'exceptZero'
  /**
   * Render on the odometer drum, so the digits roll when the figure changes.
   *
   * Off by default and switched on deliberately, because docs/03-DESIGN.md names
   * the five figures that get it — monthly total, cost per km, total invested,
   * fund progress, build-sheet total — and then says everything else stays
   * quiet so that lands. A ledger of sixty rolling rows is the failure mode.
   */
  roll?: boolean
}

const SIZE_CLASS = {
  odometer: 'text-odometer',
  'odometer-lg': 'text-odometer-lg',
  body: 'text-body',
  label: 'text-label',
} as const

/**
 * Every number in the app is mono and tabular (docs/03-DESIGN.md), and every
 * amount is formatted from minor units by `lib/money.ts` — never by a template
 * literal at the call site.
 */
export function Money({
  amount,
  currency,
  locale,
  size = 'odometer',
  className = '',
  signDisplay,
  roll = false,
}: MoneyProps) {
  const text = formatMoney(amount, currency, { locale, signDisplay })

  return (
    <span className={`whitespace-nowrap font-mono ${SIZE_CLASS[size]} ${className}`}>
      {roll ? <Odometer value={text} /> : text}
    </span>
  )
}
