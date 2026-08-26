import type { ReactNode } from 'react'

import { BudgetArc } from '@/components/budget/budget-arc'
import { Total } from '@/components/totals/total'
import { Money } from '@/components/ui/money'
import { budgetState, type BudgetSnapshot, type CategoryBudget } from '@/lib/budgets/types'
import { formatMoney } from '@/lib/money'

/**
 * The month against its budget.
 *
 * One figure, one dial, and a list of caps. The figure on the strip is the
 * month's spend in the **monthly** view — budget-affecting expenses only,
 * amortised across the months they were spread over — because that is the only
 * number a budget can honestly be measured against. It comes out of
 * `v_budget_month`, which reads `v_expense_impact`, and this component does no
 * arithmetic beyond turning a fraction into a percentage to print.
 *
 * The one place that is worth saying out loud is the caption under the figure.
 * A month with a spread purchase in it shows a smaller number here than the
 * ledger shows for the same month, and somebody who does not know why has been
 * lied to. So the caption says which of the three views this is, every time.
 */

type BudgetPanelProps = {
  snapshot: BudgetSnapshot
  /** "August 2026", formatted on the server. See `lib/dates-display.ts`. */
  monthLabel: string
  locale: string
  icons: Record<string, ReactNode>
  /** The editor, which is a Client Component and is passed in rather than imported. */
  editor: ReactNode
}

export function BudgetPanel({ snapshot, monthLabel, locale, icons, editor }: BudgetPanelProps) {
  const { overall, caps, currency } = snapshot
  const state = budgetState(overall)
  const fraction = overall.used_fraction ?? 0

  return (
    <section className="space-y-3">
      <Total
        view="Monthly"
        context={monthLabel}
        emphasis="hero"
        amount={overall.spent}
        currency={currency}
        locale={locale}
        caption="Budget-affecting spend, with a spread cost counted as this month's slice rather than the whole purchase."
      />

      {state === 'unset' ? (
        <p className="rounded-md border border-border bg-surface p-4 text-body text-ink-muted">
          {`No budget set for ${monthLabel}. Set one and the dial starts reading.`}
        </p>
      ) : (
        <div className="flex flex-col items-center gap-2 rounded-md border border-border bg-surface p-4">
          <BudgetArc
            fraction={fraction}
            reading={`${Math.round(fraction * 100)}%`}
            caption={state === 'over' ? 'over budget' : 'of budget'}
            label={`${Math.round(fraction * 100)} per cent of ${formatMoney(
              overall.budget_amount ?? 0,
              currency,
              { locale },
            )} spent in ${monthLabel}`}
          />
          <p className="text-center text-caption text-ink-muted">
            {'of '}
            <Money
              amount={overall.budget_amount ?? 0}
              currency={currency}
              locale={locale}
              size="label"
              className="text-ink"
            />
          </p>
          <p className="text-center text-body text-ink">
            {state === 'over' ? (
              <>
                <Money
                  amount={Math.abs(overall.remaining ?? 0)}
                  currency={currency}
                  locale={locale}
                  size="odometer"
                  className="text-critical"
                />
                {' over'}
              </>
            ) : (
              <>
                <Money
                  amount={overall.remaining ?? 0}
                  currency={currency}
                  locale={locale}
                  size="odometer"
                  className="text-positive"
                />
                {' left'}
              </>
            )}
          </p>
        </div>
      )}

      {editor}

      {caps.length > 0 ? (
        <div className="space-y-2">
          <h3 className="text-eyebrow font-display uppercase text-ink-muted">Caps</h3>
          <ul className="overflow-hidden rounded-md border border-border bg-surface">
            {caps.map((cap) => (
              <CapRow key={cap.budget_id} cap={cap} locale={locale} icon={icons[cap.category_icon]} />
            ))}
          </ul>
        </div>
      ) : null}
    </section>
  )
}

/**
 * One capped category. A hairline bar rather than a second dial: there are four
 * signature elements in docs/03-DESIGN.md and the arc is one of them, so putting
 * eight small ones down a list would spend the whole effect in one screen.
 *
 * The bar carries the category's own colour up to the cap and turns ember past
 * it, and the words next to it say the same thing — colour never carries meaning
 * alone.
 */
function CapRow({
  cap,
  locale,
  icon,
}: {
  cap: CategoryBudget
  locale: string
  icon: ReactNode
}) {
  const fraction = cap.used_fraction ?? 0
  const over = fraction > 1
  const width = Math.min(Math.max(fraction, 0), 1) * 100

  return (
    <li className="space-y-2 border-b border-border px-3 py-3 last:border-b-0">
      <div className="flex items-baseline justify-between gap-3">
        <span className="flex min-w-0 items-center gap-2">
          <span className="shrink-0" style={{ color: cap.category_colour_hex }} aria-hidden>
            {icon}
          </span>
          <span className="truncate text-body text-ink">{cap.category_name}</span>
        </span>
        <span className="shrink-0 text-right">
          <Money amount={cap.spent} currency={cap.currency} locale={locale} size="odometer" />
        </span>
      </div>

      <div
        className="h-1.5 w-full overflow-hidden rounded-full bg-surface-sunken"
        role="img"
        aria-label={`${Math.round(fraction * 100)} per cent of the cap used`}
      >
        <div
          className="h-full rounded-full"
          style={{
            width: `${width.toFixed(1)}%`,
            backgroundColor: over ? 'var(--critical)' : cap.category_colour_hex,
          }}
        />
      </div>

      <p className="text-caption text-ink-muted">
        {over ? (
          <>
            <Money
              amount={Math.abs(cap.remaining)}
              currency={cap.currency}
              locale={locale}
              size="label"
              className="text-critical"
            />
            {' over a cap of '}
          </>
        ) : (
          <>
            <Money amount={cap.remaining} currency={cap.currency} locale={locale} size="label" />
            {' left of '}
          </>
        )}
        <Money amount={cap.budget_amount} currency={cap.currency} locale={locale} size="label" />
      </p>
    </li>
  )
}
