import { Money } from '@/components/ui/money'
import { formatMoney } from '@/lib/money'
import { Stat } from '@/components/totals/total'
import { BOARD_STATUSES, MOD_STATUS_LABEL, type ModBoard } from '@/lib/mods/types'

type BuildSheetProps = {
  totals: ModBoard['totals']
  currency: string
  locale: string
}

/**
 * The build sheet.
 *
 * docs/01-PRODUCT.md: "the mod board rolls up into a total — what the current
 * plan costs, split by status, so 'everything I want' has a single honest number
 * attached to it."
 *
 * Honest is the load-bearing word, so the caption says two things the headline
 * cannot. How much of the plan has already been paid for, because a board with
 * four installed mods on it is not a bill for the whole figure. And how many
 * mods carry no estimate at all, because the total of the ones that do is not
 * the total of the plan, and a number that quietly implies otherwise is worse
 * than no number.
 *
 * It is the screen's one hero figure and it sits on the recessed panel the rest
 * of the app's headline numbers use (docs/03-DESIGN.md, signature element 1).
 */
export function BuildSheet({ totals, currency, locale }: BuildSheetProps) {
  const whole = totals.whole
  const priced = whole.mods - whole.without_estimate

  const mods = `${whole.mods} ${whole.mods === 1 ? 'mod' : 'mods'}`

  const coverage =
    whole.without_estimate === 0
      ? `Across ${mods}.`
      : priced === 0
        ? `None of the ${mods} has an estimate yet.`
        : `${whole.without_estimate} of ${mods} ${whole.without_estimate === 1 ? 'has' : 'have'} no estimate, so this is the cost of the other ${priced}.`

  const caption =
    whole.mods === 0
      ? 'Nothing planned yet.'
      : [
          whole.actual_total > 0
            ? `${formatMoney(whole.actual_total, currency, { locale })} of it is already spent.`
            : null,
          coverage,
        ]
          .filter(Boolean)
          .join(' ')

  return (
    <Stat
      name="Build sheet"
      view="Estimate"
      context="The whole plan"
      emphasis="hero"
      caption={caption}
    >
      <div className="space-y-3">
        <Money
          amount={whole.estimate_total}
          currency={currency}
          locale={locale}
          size="odometer-lg"
          roll
        />

        <dl className="divide-y divide-border border-t border-border">
          {BOARD_STATUSES.filter((status) => totals[status].mods > 0).map((status) => (
            <div key={status} className="flex items-baseline justify-between gap-4 py-1">
              <dt className="text-caption text-ink-muted">
                {MOD_STATUS_LABEL[status]}
                <span className="text-ink-faint">{` · ${totals[status].mods}`}</span>
              </dt>
              <dd>
                <Money
                  amount={totals[status].estimate_total}
                  currency={currency}
                  locale={locale}
                  size="label"
                  className="text-ink-muted"
                />
              </dd>
            </div>
          ))}
        </dl>
      </div>
    </Stat>
  )
}
