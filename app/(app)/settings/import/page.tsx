import type { Metadata } from 'next'

import { ImportCsv } from '@/components/settings/import-csv'
import { fetchRankedCategories } from '@/lib/queries/categories'
import { fetchProfilePreferences } from '@/lib/queries/profile'
import { fetchVehicleOptions } from '@/lib/queries/vehicles'

export const metadata: Metadata = { title: 'Import' }

/**
 * The commit is one transaction over a whole file, and a full one takes about
 * ten seconds against a local database. Vercel's default ceiling for a function
 * is shorter than that, and a request killed mid-transaction is the one outcome
 * this phase is built to prevent — the database would roll back correctly and
 * the person would be left with no idea whether it had. Sixty seconds is the
 * most every Vercel plan allows and is four times the longest import the row
 * limit permits.
 */
export const maxDuration = 60

/**
 * Arriving.
 *
 * Everything the mapping screen needs is fetched here and handed over finished:
 * the categories a name can match, the cars a nickname can match, and the base
 * currency an unqualified amount is read in. The file itself never leaves the
 * browser until the commit — reading it, guessing its encoding, mapping its
 * columns and previewing the result all happen on the device, and the only
 * thing that crosses the network is a list of expenses that have already been
 * checked once.
 */
export default async function ImportPage() {
  const [categories, vehicles, preferences] = await Promise.all([
    fetchRankedCategories(),
    fetchVehicleOptions(),
    fetchProfilePreferences(),
  ])

  return (
    <ImportCsv
      categories={categories.map((category) => ({
        id: category.id,
        name: category.name,
        default_bucket: category.default_bucket,
        default_counts_toward_budget: category.default_counts_toward_budget,
      }))}
      vehicles={vehicles.map((vehicle) => ({ id: vehicle.id, nickname: vehicle.nickname }))}
      currency={preferences.baseCurrency}
      locale={preferences.locale}
    />
  )
}
