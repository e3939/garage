import type { Metadata } from 'next'
import { notFound } from 'next/navigation'

import { categoryIconMap } from '@/components/expenses/category-icons'
import { BuildSheet } from '@/components/mods/build-sheet'
import { ModBoard } from '@/components/mods/mod-board'
import { modIcons } from '@/components/mods/mod-icons'
import { todayIso } from '@/lib/dates'
import { dateLabel } from '@/lib/dates-display'
import { fetchRankedCategories } from '@/lib/queries/categories'
import { fetchAmortiseThreshold } from '@/lib/queries/expenses'
import { fetchFundOffersByMod } from '@/lib/queries/funds'
import { fetchModBoard } from '@/lib/queries/mods'
import { fetchProfilePreferences, fetchUserId } from '@/lib/queries/profile'
import { fetchVehicle, fetchVehicleOptions } from '@/lib/queries/vehicles'
import type { CategoryOption } from '@/lib/expenses/types'

export const metadata: Metadata = { title: 'Plan' }

type PlanPageProps = {
  params: Promise<{ vehicleId: string }>
}

/**
 * Where a mod expense files itself.
 *
 * The seeded category is called "Mods & Parts", but a category is renameable, so
 * a rename must not silently start filing coilovers under Groceries. The name is
 * tried first and the fallback is the first live project-bucket category, which
 * is what "Mods & Parts" is. Null only when there is no project category at all,
 * and then the form opens with the chips unanswered rather than guessing.
 */
function modCategory(categories: readonly CategoryOption[]): string | null {
  const live = categories.filter((category) => category.archived_at === null)
  const named = live.find((category) => category.name === 'Mods & Parts')
  if (named) return named.id
  return live.find((category) => category.default_bucket === 'car_project')?.id ?? null
}

/**
 * The mod board and the build sheet (docs/01-PRODUCT.md, section C).
 *
 * Everything on this page is computed by `mod_board` and `v_mod_board_totals`;
 * nothing is reduced in the browser. Dates are turned into words here too, for
 * the reason recorded in `lib/dates-display.ts` — a locale's month names are
 * eight kilobytes and the board is otherwise a list of strings the server
 * already has.
 */
export default async function PlanPage({ params }: PlanPageProps) {
  const { vehicleId } = await params

  const [preferences, vehicle] = await Promise.all([fetchProfilePreferences(), fetchVehicle(vehicleId)])
  if (!vehicle) notFound()

  const [board, categories, vehicles, amortiseThreshold, userId, fundOffers] = await Promise.all([
    fetchModBoard(vehicle.id, preferences.baseCurrency),
    fetchRankedCategories(),
    fetchVehicleOptions(),
    fetchAmortiseThreshold(),
    fetchUserId(),
    // In parallel with the rest, not after it: the board cannot render the
    // install sheet before it has the card anyway, and a waterfall here would
    // cost the whole page a round trip (CLAUDE.md section 3).
    fetchFundOffersByMod(vehicle.id),
  ])

  const targetLabels: Record<string, string> = {}
  for (const card of board.cards) {
    if (card.target_date) targetLabels[card.id] = dateLabel(card.target_date)
  }

  return (
    <div className="space-y-6">
      <BuildSheet totals={board.totals} currency={board.currency} locale={preferences.locale} />

      {board.cards.length === 0 ? (
        <p className="text-body text-ink-muted">
          Nothing planned yet. Add the first thing you want to do to the car and it lands in
          Dreaming; drag it right as it gets closer to real.
        </p>
      ) : null}

      <ModBoard
        vehicleId={vehicle.id}
        board={board}
        icons={modIcons()}
        locale={preferences.locale}
        today={todayIso()}
        userId={userId ?? ''}
        targetLabels={targetLabels}
        fundOffers={fundOffers}
        modCategoryId={modCategory(categories)}
        expense={{
          userId: userId ?? '',
          categories,
          icons: categoryIconMap(categories),
          vehicles,
          currency: preferences.baseCurrency,
          locale: preferences.locale,
          amortiseThreshold,
          today: todayIso(),
        }}
      />
    </div>
  )
}
