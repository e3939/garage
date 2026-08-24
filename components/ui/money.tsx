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
}: MoneyProps) {
  return (
    <span className={`whitespace-nowrap font-mono ${SIZE_CLASS[size]} ${className}`}>
      {formatMoney(amount, currency, { locale, signDisplay })}
    </span>
  )
}
