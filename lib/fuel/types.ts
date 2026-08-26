import type { AttachmentView } from '@/lib/attachments/types'
import type { IsoDate } from '@/lib/dates'
import type { ConsumptionInterval } from '@/lib/fuel/consumption'

/** One fill-up, as the log shows it. */
export type FuelLog = {
  id: string
  vehicle_id: string
  filled_on: IsoDate
  odometer_km: number
  litres: number
  total_cost: number
  currency: string
  is_full_tank: boolean
  missed_previous: boolean
  station: string | null
  expense_id: string | null
  photo_count: number
}

/** `v_fuel_summary`, one row per vehicle. */
export type FuelSummary = {
  vehicle_id: string
  currency: string
  /** Every fill-up, including partials and broken chains. This is what was spent. */
  fills: number
  first_on: IsoDate | null
  last_on: IsoDate | null
  total_litres: number
  total_cost: number
  /** Only closed, unbroken intervals. This is what can be measured. */
  intervals: number
  measured_km: number
  measured_litres: number
  l_per_100km: number | null
  km_per_l: number | null
  cost_per_km: number | null
  latest_l_per_100km: number | null
  latest_km_per_l: number | null
  rolling3_l_per_100km: number | null
  latest_on: IsoDate | null
}

export const EMPTY_FUEL_SUMMARY: Omit<FuelSummary, 'vehicle_id' | 'currency'> = {
  fills: 0,
  first_on: null,
  last_on: null,
  total_litres: 0,
  total_cost: 0,
  intervals: 0,
  measured_km: 0,
  measured_litres: 0,
  l_per_100km: null,
  km_per_l: null,
  cost_per_km: null,
  latest_l_per_100km: null,
  latest_km_per_l: null,
  rolling3_l_per_100km: null,
  latest_on: null,
}

/**
 * A mod that went on the car on a given day, for the markers over the chart.
 *
 * docs/01-PRODUCT.md: "A meaningful consumption change after a mod is annotated
 * on the chart automatically: 'Intake installed' marker on the date."
 */
export type ModMarker = {
  id: string
  title: string
  installed_on: IsoDate
}

export type FuelPage = {
  logs: FuelLog[]
  intervals: ConsumptionInterval[]
  summary: FuelSummary
  markers: ModMarker[]
  photos: Record<string, AttachmentView[]>
}

/**
 * Price per litre while it is being typed, so a typo in either field is
 * obvious before it is saved.
 *
 * Returned in minor units, because that is what money is everywhere else in this
 * app and rounding it to whole minor units here is what stops a formatter from
 * inventing a precision the two typed numbers do not have.
 */
export function pricePerLitre(totalCost: number | null, litres: number | null): number | null {
  if (totalCost === null || litres === null) return null
  if (!Number.isFinite(litres) || litres <= 0) return null
  return Math.round(totalCost / litres)
}
