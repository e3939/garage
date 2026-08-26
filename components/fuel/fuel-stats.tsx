import { Stat, Total } from '@/components/totals/total'
import type { FuelSummary } from '@/lib/fuel/types'

type FuelStatsProps = {
  summary: FuelSummary
  locale: string
}

/**
 * The four figures at the top of the fuel screen.
 *
 * L/100km and km/L sit in one panel because docs/01-PRODUCT.md asks for both —
 * "different habits" — and showing them apart would make them look like two
 * facts rather than one number read two ways.
 *
 * The rolling three-tank average is next to the lifetime figure rather than
 * instead of it: the lifetime number is what the car does and the rolling one is
 * what it is doing lately, and the gap between them is the interesting part.
 *
 * Every one of these comes out of `v_fuel_summary`. Nothing here divides.
 */
export function FuelStats({ summary, locale }: FuelStatsProps) {
  const measured = summary.measured_km.toLocaleString(locale)

  return (
    <div className="space-y-3">
      <Stat
        name="Consumption"
        view="All-in"
        context={summary.intervals === 0 ? 'Not measured yet' : `${summary.intervals} full tanks`}
        emphasis="hero"
        caption={
          summary.intervals === 0
            ? 'Two full tanks in a row is all it takes. Partial fills count toward the next one.'
            : `Litres burned over ${measured} km measured between full tanks.`
        }
      >
        {summary.l_per_100km === null ? (
          <span className="font-mono text-odometer-lg text-ink-faint" aria-label="Not measured yet">
            &mdash;
          </span>
        ) : (
          <span className="font-mono text-odometer-lg text-ink">
            {`${summary.l_per_100km} L/100km`}
          </span>
        )}
      </Stat>

      <div className="grid grid-cols-2 gap-3">
        <Stat
          name="The other way round"
          view="All-in"
          context="Lifetime"
          caption="Same number, the other habit."
        >
          {summary.km_per_l === null ? (
            <span className="font-mono text-odometer text-ink-faint">&mdash;</span>
          ) : (
            <span className="font-mono text-odometer text-ink">{`${summary.km_per_l} km/L`}</span>
          )}
        </Stat>

        <Stat
          name="Last three tanks"
          view="All-in"
          context="Rolling"
          caption={
            summary.rolling3_l_per_100km === null
              ? 'Needs a closed interval.'
              : summary.l_per_100km === null
                ? ''
                : summary.rolling3_l_per_100km > summary.l_per_100km
                  ? 'Thirstier than usual lately.'
                  : summary.rolling3_l_per_100km < summary.l_per_100km
                    ? 'Better than usual lately.'
                    : 'About what it always does.'
          }
        >
          {summary.rolling3_l_per_100km === null ? (
            <span className="font-mono text-odometer text-ink-faint">&mdash;</span>
          ) : (
            <span className="font-mono text-odometer text-ink">
              {`${summary.rolling3_l_per_100km} L/100km`}
            </span>
          )}
        </Stat>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <Total
          name="Fuel per km"
          view="Car only"
          context="Measured"
          amount={summary.cost_per_km}
          currency={summary.currency}
          locale={locale}
          suffix="/km"
          caption="What the fuel alone costs to move the car one kilometre."
        />

        <Total
          name="Spent on fuel"
          view="Car only"
          context="Every fill-up"
          amount={summary.total_cost}
          currency={summary.currency}
          locale={locale}
          caption={
            summary.fills === 0
              ? 'No fill-ups yet.'
              : `${summary.fills} ${summary.fills === 1 ? 'fill-up' : 'fill-ups'}, ${summary.total_litres} litres.`
          }
        />
      </div>
    </div>
  )
}
