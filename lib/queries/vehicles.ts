import 'server-only'

import { createClient } from '@/lib/supabase/server'
import type { VehicleOption } from '@/lib/expenses/types'
import type { Vehicle, VehicleClosing, VehicleTotals } from '@/lib/vehicles/types'
import { monthTotalsFrom } from '@/lib/queries/expenses'
import { EMPTY_MONTH_TOTALS, type MonthViewTotals } from '@/lib/views'
import type { IsoDate } from '@/lib/dates'

const VEHICLE_COLUMNS = [
  'id',
  'nickname',
  'make',
  'model',
  'year',
  'trim',
  'plate',
  'colour_hex',
  'fuel_type',
  'transmission',
  'purchase_date',
  'purchase_price',
  'currency',
  'purchase_odometer_km',
  'odometer_km',
  'odometer_at',
  'hero_photo_path',
  'status',
  'sold_date',
  'sold_price',
  'sort_order',
  'archived_at',
].join(', ')

/**
 * The vehicles an expense may be attached to: owned, not archived, in the order
 * the garage shows them.
 */
export async function fetchVehicleOptions(): Promise<VehicleOption[]> {
  const supabase = await createClient()

  const { data, error } = await supabase
    .from('vehicles')
    .select('id, nickname, colour_hex, odometer_km')
    .is('archived_at', null)
    .eq('status', 'owned')
    .order('sort_order', { ascending: true })
    .order('nickname', { ascending: true })

  if (error) throw new Error(`vehicles failed: ${error.message}`)
  return data ?? []
}

/**
 * The garage. Archived vehicles are excluded by default — selling or retiring a
 * car does not delete it, and its history stays readable, but it is not what the
 * garage is for.
 */
export async function fetchVehicles(includeArchived = false): Promise<Vehicle[]> {
  const supabase = await createClient()

  let query = supabase
    .from('vehicles')
    .select(VEHICLE_COLUMNS)
    .order('sort_order', { ascending: true })
    .order('nickname', { ascending: true })

  if (!includeArchived) query = query.is('archived_at', null)

  const { data, error } = await query
  if (error) throw new Error(`vehicles failed: ${error.message}`)
  return (data ?? []) as unknown as Vehicle[]
}

export async function fetchVehicle(id: string): Promise<Vehicle | null> {
  const supabase = await createClient()

  const { data, error } = await supabase
    .from('vehicles')
    .select(VEHICLE_COLUMNS)
    .eq('id', id)
    .maybeSingle()

  if (error) throw new Error(`vehicles failed: ${error.message}`)
  return (data as unknown as Vehicle) ?? null
}

const TOTALS_COLUMNS =
  'vehicle_id, currency, total_spend, running_spend, project_spend, purchase_price, total_invested, km_driven, cost_per_km, months_owned, planning_accuracy'

function totalsFrom(row: Record<string, unknown> | null, vehicleId: string, currency: string): VehicleTotals {
  const number = (value: unknown): number => (typeof value === 'number' ? value : 0)
  const nullable = (value: unknown): number | null => (typeof value === 'number' ? value : null)

  return {
    vehicle_id: vehicleId,
    currency: typeof row?.currency === 'string' ? row.currency : currency,
    total_spend: number(row?.total_spend),
    running_spend: number(row?.running_spend),
    project_spend: number(row?.project_spend),
    purchase_price: number(row?.purchase_price),
    total_invested: number(row?.total_invested),
    km_driven: number(row?.km_driven),
    cost_per_km: nullable(row?.cost_per_km),
    months_owned: nullable(row?.months_owned),
    planning_accuracy: nullable(row?.planning_accuracy),
  }
}

/**
 * The lifetime figures for one vehicle, straight out of `v_vehicle_totals`. Every
 * one of them is computed by Postgres; nothing here does arithmetic
 * (CLAUDE.md section 3).
 */
export async function fetchVehicleTotals(
  vehicleId: string,
  currency: string,
): Promise<VehicleTotals> {
  const supabase = await createClient()

  const { data, error } = await supabase
    .from('v_vehicle_totals')
    .select(TOTALS_COLUMNS)
    .eq('vehicle_id', vehicleId)
    .maybeSingle()

  if (error) throw new Error(`v_vehicle_totals failed: ${error.message}`)
  return totalsFrom(data as Record<string, unknown> | null, vehicleId, currency)
}

/** The same, for the whole garage in one query. */
export async function fetchAllVehicleTotals(currency: string): Promise<Map<string, VehicleTotals>> {
  const supabase = await createClient()

  const { data, error } = await supabase.from('v_vehicle_totals').select(TOTALS_COLUMNS)
  if (error) throw new Error(`v_vehicle_totals failed: ${error.message}`)

  const byVehicle = new Map<string, VehicleTotals>()
  for (const row of (data ?? []) as unknown as Record<string, unknown>[]) {
    const id = typeof row.vehicle_id === 'string' ? row.vehicle_id : null
    if (!id) continue
    byVehicle.set(id, totalsFrom(row, id, currency))
  }
  return byVehicle
}

const MONTH_COLUMNS =
  'vehicle_id, month, currency, monthly_total, monthly_count, all_in_total, all_in_count, car_only_total, car_only_count'

/**
 * One vehicle's month, in all three views. Fetching all three costs the same one
 * row as fetching one, and means the switcher never waits on the network.
 */
export async function fetchVehicleMonthTotals(
  vehicleId: string,
  month: IsoDate,
  currency: string,
): Promise<MonthViewTotals> {
  const supabase = await createClient()

  const { data, error } = await supabase
    .from('v_vehicle_month_totals')
    .select(MONTH_COLUMNS)
    .eq('vehicle_id', vehicleId)
    .eq('month', month)
    .eq('currency', currency)
    .maybeSingle()

  if (error) throw new Error(`v_vehicle_month_totals failed: ${error.message}`)
  return monthTotalsFrom(data)
}

/** The whole garage's month, in one query, keyed by vehicle. */
export async function fetchGarageMonthTotals(
  month: IsoDate,
  currency: string,
): Promise<Map<string, MonthViewTotals>> {
  const supabase = await createClient()

  const { data, error } = await supabase
    .from('v_vehicle_month_totals')
    .select(MONTH_COLUMNS)
    .eq('month', month)
    .eq('currency', currency)

  if (error) throw new Error(`v_vehicle_month_totals failed: ${error.message}`)

  const byVehicle = new Map<string, MonthViewTotals>()
  for (const row of data ?? []) {
    if (!row.vehicle_id) continue
    byVehicle.set(row.vehicle_id, monthTotalsFrom(row))
  }
  return byVehicle
}

export function emptyMonthTotals(): MonthViewTotals {
  return EMPTY_MONTH_TOTALS
}

const CLOSING_COLUMNS = [
  'vehicle_id',
  'currency',
  'nickname',
  'status',
  'purchase_date',
  'sold_date',
  'archived_at',
  'sold_price',
  'purchase_price',
  'total_spend',
  'running_spend',
  'project_spend',
  'total_invested',
  'km_driven',
  'cost_per_km',
  'months_owned',
  'net_cost',
  'net_cost_per_km',
  'mods_installed',
  'fill_ups',
  'services_done',
  'expense_count',
].join(', ')

/**
 * The closing summary, in one query.
 *
 * Every figure on that page comes from `v_vehicle_closing` — the money, the
 * distance, the counts and the arithmetic net of the sale. Nothing on the page
 * subtracts anything (CLAUDE.md section 3).
 */
export async function fetchVehicleClosing(vehicleId: string): Promise<VehicleClosing | null> {
  const supabase = await createClient()

  const { data, error } = await supabase
    .from('v_vehicle_closing')
    .select(CLOSING_COLUMNS)
    .eq('vehicle_id', vehicleId)
    .maybeSingle()

  if (error) throw new Error(`v_vehicle_closing failed: ${error.message}`)
  return (data as unknown as VehicleClosing) ?? null
}
