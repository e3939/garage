import type { IsoDate } from '@/lib/dates'

/**
 * A vehicle, and the vocabulary the spec strip is written in.
 *
 * `fuel_type` and `transmission` are text columns with their allowed values in a
 * SQL comment rather than a check constraint (docs/02-DATA-MODEL.md), so these
 * lists are the enforcement — zod at the edge, and a select that offers nothing
 * else.
 */

export const FUEL_TYPES = ['petrol', 'diesel', 'hybrid', 'ev'] as const
export type FuelType = (typeof FUEL_TYPES)[number]

export const FUEL_TYPE_LABEL: Readonly<Record<FuelType, string>> = {
  petrol: 'Petrol',
  diesel: 'Diesel',
  hybrid: 'Hybrid',
  ev: 'Electric',
}

export const TRANSMISSIONS = ['manual', 'auto', 'dct', 'cvt'] as const
export type Transmission = (typeof TRANSMISSIONS)[number]

export const TRANSMISSION_LABEL: Readonly<Record<Transmission, string>> = {
  manual: 'Manual',
  auto: 'Automatic',
  dct: 'DCT',
  cvt: 'CVT',
}

export const VEHICLE_STATUSES = ['owned', 'sold'] as const
export type VehicleStatus = (typeof VEHICLE_STATUSES)[number]

/** The vehicle as every screen in this phase reads it. */
export type Vehicle = {
  id: string
  nickname: string
  make: string | null
  model: string | null
  year: number | null
  trim: string | null
  plate: string | null
  colour_hex: string | null
  fuel_type: string | null
  transmission: string | null
  purchase_date: IsoDate | null
  purchase_price: number | null
  currency: string | null
  purchase_odometer_km: number
  odometer_km: number
  odometer_at: IsoDate | null
  hero_photo_path: string | null
  status: VehicleStatus
  sold_date: IsoDate | null
  sold_price: number | null
  sort_order: number
  archived_at: string | null
}

/** `v_vehicle_totals`, one row per vehicle, in the profile's base currency. */
export type VehicleTotals = {
  vehicle_id: string
  currency: string
  total_spend: number
  running_spend: number
  project_spend: number
  purchase_price: number
  /** Purchase price plus every car-bucket expense, undiscounted. */
  total_invested: number
  km_driven: number
  /** Total invested over km driven. Null until the car has moved. */
  cost_per_km: number | null
  months_owned: number | null
  /** Actuals over estimates across installed mods. Roadmap Phase 5 surfaces it. */
  planning_accuracy: number | null
}

/**
 * `v_vehicle_closing`: everything the closing summary is made of.
 *
 * The lifetime figures from `v_vehicle_totals`, plus the sale, plus the same
 * arithmetic net of it, plus four counts of the log. Defined for a car you still
 * own as well as one you sold — with no sale, `net_cost` is `total_invested`.
 */
export type VehicleClosing = {
  vehicle_id: string
  currency: string
  nickname: string
  status: VehicleStatus
  purchase_date: IsoDate | null
  sold_date: IsoDate | null
  archived_at: string | null
  /** Null when no price was recorded, or when it was in another currency. */
  sold_price: number | null
  purchase_price: number
  total_spend: number
  running_spend: number
  project_spend: number
  /** Purchase price plus every car-bucket expense. What the car cost to own. */
  total_invested: number
  km_driven: number
  cost_per_km: number | null
  months_owned: number | null
  /** Total invested less the sale price. Negative if it sold for more. */
  net_cost: number
  net_cost_per_km: number | null
  mods_installed: number
  fill_ups: number
  services_done: number
  expense_count: number
}

/**
 * "2019 · Honda · Civic · RS · DCT · Petrol", minus whatever is not known.
 * A field nobody filled in is left out rather than shown as a dash: an empty
 * slot in a spec strip reads as a fault in the car, not a gap in the form.
 */
export function specStripParts(vehicle: Vehicle): string[] {
  const fuel = vehicle.fuel_type as FuelType | null
  const transmission = vehicle.transmission as Transmission | null

  return [
    vehicle.year === null ? null : String(vehicle.year),
    vehicle.make,
    vehicle.model,
    vehicle.trim,
    transmission && transmission in TRANSMISSION_LABEL ? TRANSMISSION_LABEL[transmission] : null,
    fuel && fuel in FUEL_TYPE_LABEL ? FUEL_TYPE_LABEL[fuel] : null,
  ].filter((part): part is string => Boolean(part && part.trim()))
}

/** The line under the nickname on a list row: make and model, or the plate. */
export function vehicleSubtitle(vehicle: Vehicle): string | null {
  const parts = [vehicle.year === null ? null : String(vehicle.year), vehicle.make, vehicle.model]
    .filter((part): part is string => Boolean(part && part.trim()))
    .join(' ')
  return parts || vehicle.plate || null
}

/** The swatch shown in UI chrome. Falls back to the bucket colour for a car. */
export function vehicleColour(vehicle: Pick<Vehicle, 'colour_hex'>): string {
  return vehicle.colour_hex ?? 'var(--bucket-car-running)'
}

/**
 * Alt text for the hero photo, derived from context rather than left empty
 * (docs/03-DESIGN.md, quality floor).
 */
export function heroAlt(vehicle: Vehicle): string {
  const spec = specStripParts(vehicle).slice(0, 3).join(' ')
  return spec ? `${vehicle.nickname}, ${spec}` : vehicle.nickname
}
