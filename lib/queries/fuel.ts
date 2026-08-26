import 'server-only'

import { createClient } from '@/lib/supabase/server'
import { fetchAttachments } from '@/lib/attachments/server'
import { signAttachments } from '@/lib/storage/signed-url'
import type { AttachmentView } from '@/lib/attachments/types'
import type { ConsumptionInterval } from '@/lib/fuel/consumption'
import { EMPTY_FUEL_SUMMARY, type FuelLog, type FuelPage, type FuelSummary, type ModMarker } from '@/lib/fuel/types'

/**
 * `numeric` arrives from PostgREST as a string, because JavaScript's number
 * cannot hold every value the type can. Litres and consumption figures are well
 * inside what a double represents exactly enough to divide by, so they are
 * turned back into numbers once, here, rather than in every component.
 */
function num(value: unknown): number {
  if (typeof value === 'number') return value
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : 0
}

function nullableNum(value: unknown): number | null {
  if (value === null || value === undefined) return null
  const parsed = typeof value === 'number' ? value : Number(value)
  return Number.isFinite(parsed) ? parsed : null
}

/**
 * The fuel screen in three round trips: the fills, the intervals the view
 * computed from them, and the mods that went on the car in the same window.
 *
 * The log is not paged. A fill-up is monthly-ish and a hundred and twenty of
 * them is ten years of driving; the list virtualises above forty rows the same
 * way the ledger does, which is the constraint CLAUDE.md section 3 actually
 * names.
 */
export async function fetchFuelPage(vehicleId: string, currency: string): Promise<FuelPage> {
  const supabase = await createClient()

  const [logs, intervals, summary, markers] = await Promise.all([
    supabase
      .from('fuel_logs')
      .select(
        'id, vehicle_id, filled_on, odometer_km, litres, total_cost, currency, is_full_tank, missed_previous, station, expense_id, attachments(id)',
      )
      .eq('vehicle_id', vehicleId)
      .order('filled_on', { ascending: false })
      .order('odometer_km', { ascending: false })
      .limit(120),
    supabase
      .from('v_fuel_consumption')
      .select(
        'end_fuel_log_id, started_on, ended_on, start_km, end_km, km, litres, fills, currency, cost, l_per_100km, km_per_l, cost_per_km, cost_per_litre, rolling3_l_per_100km',
      )
      .eq('vehicle_id', vehicleId)
      .order('ended_on', { ascending: true })
      .order('end_km', { ascending: true }),
    supabase
      .from('v_fuel_summary')
      .select(
        'vehicle_id, currency, fills, first_on, last_on, total_litres, total_cost, intervals, measured_km, measured_litres, l_per_100km, km_per_l, cost_per_km, latest_l_per_100km, latest_km_per_l, rolling3_l_per_100km, latest_on',
      )
      .eq('vehicle_id', vehicleId)
      .maybeSingle(),
    supabase
      .from('mod_plans')
      .select('id, title, installed_on')
      .eq('vehicle_id', vehicleId)
      .eq('status', 'installed')
      .is('archived_at', null)
      .not('installed_on', 'is', null)
      .order('installed_on', { ascending: true }),
  ])

  if (logs.error) throw new Error(`fuel_logs failed: ${logs.error.message}`)
  if (intervals.error) throw new Error(`v_fuel_consumption failed: ${intervals.error.message}`)
  if (summary.error) throw new Error(`v_fuel_summary failed: ${summary.error.message}`)
  if (markers.error) throw new Error(`mod_plans failed: ${markers.error.message}`)

  type RawLog = Omit<FuelLog, 'litres' | 'photo_count' | 'currency'> & {
    litres: unknown
    currency: string | null
    attachments: { id: string }[] | null
  }

  const rows = (logs.data ?? []) as unknown as RawLog[]

  return {
    logs: rows.map(({ attachments, ...row }) => ({
      ...row,
      currency: row.currency ?? currency,
      litres: num(row.litres),
      photo_count: attachments?.length ?? 0,
    })),
    intervals: (intervals.data ?? []).map((row) => {
      const raw = row as Record<string, unknown>
      return {
        end_fuel_log_id: String(raw.end_fuel_log_id),
        started_on: String(raw.started_on),
        ended_on: String(raw.ended_on),
        start_km: num(raw.start_km),
        end_km: num(raw.end_km),
        km: num(raw.km),
        litres: num(raw.litres),
        fills: num(raw.fills),
        currency: String(raw.currency ?? currency),
        cost: nullableNum(raw.cost),
        l_per_100km: num(raw.l_per_100km),
        km_per_l: num(raw.km_per_l),
        cost_per_km: nullableNum(raw.cost_per_km),
        cost_per_litre: nullableNum(raw.cost_per_litre),
        rolling3_l_per_100km: num(raw.rolling3_l_per_100km),
      } satisfies ConsumptionInterval
    }),
    summary: summaryFrom(summary.data, vehicleId, currency),
    markers: (markers.data ?? []) as ModMarker[],
    photos: {},
  }
}

function summaryFrom(
  row: Record<string, unknown> | null,
  vehicleId: string,
  currency: string,
): FuelSummary {
  if (!row) return { vehicle_id: vehicleId, currency, ...EMPTY_FUEL_SUMMARY }

  return {
    vehicle_id: vehicleId,
    currency: typeof row.currency === 'string' ? row.currency : currency,
    fills: num(row.fills),
    first_on: (row.first_on as string | null) ?? null,
    last_on: (row.last_on as string | null) ?? null,
    total_litres: num(row.total_litres),
    total_cost: num(row.total_cost),
    intervals: num(row.intervals),
    measured_km: num(row.measured_km),
    measured_litres: num(row.measured_litres),
    l_per_100km: nullableNum(row.l_per_100km),
    km_per_l: nullableNum(row.km_per_l),
    cost_per_km: nullableNum(row.cost_per_km),
    latest_l_per_100km: nullableNum(row.latest_l_per_100km),
    latest_km_per_l: nullableNum(row.latest_km_per_l),
    rolling3_l_per_100km: nullableNum(row.rolling3_l_per_100km),
    latest_on: (row.latest_on as string | null) ?? null,
  }
}

/**
 * The one-line fuel figure for the vehicle page's nav, without fetching the log,
 * the intervals or the mods that went on the car.
 */
export async function fetchFuelSummary(vehicleId: string, currency: string): Promise<FuelSummary> {
  const supabase = await createClient()

  const { data, error } = await supabase
    .from('v_fuel_summary')
    .select(
      'vehicle_id, currency, fills, first_on, last_on, total_litres, total_cost, intervals, measured_km, measured_litres, l_per_100km, km_per_l, cost_per_km, latest_l_per_100km, latest_km_per_l, rolling3_l_per_100km, latest_on',
    )
    .eq('vehicle_id', vehicleId)
    .maybeSingle()

  if (error) throw new Error(`v_fuel_summary failed: ${error.message}`)
  return summaryFrom(data as Record<string, unknown> | null, vehicleId, currency)
}

/** One fill-up's photos, signed, for the sheet that edits it. */
export async function fetchFuelLogAttachments(logId: string): Promise<AttachmentView[]> {
  return signAttachments(await fetchAttachments('fuel_log', logId))
}
