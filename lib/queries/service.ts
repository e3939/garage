import 'server-only'

import { createClient } from '@/lib/supabase/server'
import type { ServiceDue, ServiceRecord } from '@/lib/service/types'

const DUE_COLUMNS = [
  'schedule_id',
  'vehicle_id',
  'name',
  'interval_km',
  'interval_months',
  'last_done_km',
  'last_done_on',
  'notes',
  'odometer_km',
  'basis',
  'basis_km',
  'basis_on',
  'due_km',
  'due_date',
  'km_remaining',
  'days_remaining',
  'km_fraction',
  'day_fraction',
  'remaining_fraction',
  'due_by',
  'state',
  'urgency',
].join(', ')

/**
 * The whole schedule for one vehicle, most urgent first.
 *
 * Every figure comes out of `v_service_due` — the due points, both remainders
 * and the state. Nothing here does arithmetic (CLAUDE.md section 3), and the
 * ordering is the view's own `remaining_fraction`, which is how much of the
 * interval is left rather than how many kilometres, so a 200km-overdue oil
 * change outranks a coolant flush with 200km to go.
 */
export async function fetchServiceDue(vehicleId: string): Promise<ServiceDue[]> {
  const supabase = await createClient()

  const { data, error } = await supabase
    .from('v_service_due')
    .select(DUE_COLUMNS)
    .eq('vehicle_id', vehicleId)
    .order('urgency', { ascending: true })
    .order('remaining_fraction', { ascending: true, nullsFirst: false })
    .order('name', { ascending: true })

  if (error) throw new Error(`v_service_due failed: ${error.message}`)

  // `numeric` arrives as a string over PostgREST, and a fraction is arithmetic.
  return ((data ?? []) as unknown as Record<string, unknown>[]).map(rowToDue)
}

function rowToDue(row: Record<string, unknown>): ServiceDue {
  return {
    ...(row as unknown as ServiceDue),
    km_fraction: toNumber(row.km_fraction),
    day_fraction: toNumber(row.day_fraction),
    remaining_fraction: toNumber(row.remaining_fraction),
  }
}

function toNumber(value: unknown): number | null {
  if (value === null || value === undefined) return null
  const parsed = typeof value === 'number' ? value : Number(value)
  return Number.isFinite(parsed) ? parsed : null
}

/**
 * The one item the vehicle home puts a gauge on.
 *
 * Ordered by the view rather than by `mostUrgent` in TypeScript so that the
 * panel and the service screen can never disagree about which item is the
 * pressing one — same ordering, same row, one round trip that fetches one row.
 */
export async function fetchMostUrgentService(vehicleId: string): Promise<ServiceDue | null> {
  const supabase = await createClient()

  const { data, error } = await supabase
    .from('v_service_due')
    .select(DUE_COLUMNS)
    .eq('vehicle_id', vehicleId)
    .not('remaining_fraction', 'is', null)
    .order('urgency', { ascending: true })
    .order('remaining_fraction', { ascending: true })
    .limit(1)
    .maybeSingle()

  if (error) throw new Error(`v_service_due failed: ${error.message}`)
  if (!data) return null

  return rowToDue(data as unknown as Record<string, unknown>)
}

/**
 * The history: what has actually been done, newest first.
 *
 * The linked expense's amount travels with the row, because a service history
 * whose money lives one tap away is a service history nobody adds up.
 */
export async function fetchServiceRecords(
  vehicleId: string,
  limit = 60,
): Promise<ServiceRecord[]> {
  const supabase = await createClient()

  const { data, error } = await supabase
    .from('service_records')
    .select(
      'id, vehicle_id, schedule_id, name, performed_on, odometer_km, workshop, notes, expense_id, expenses(amount, currency), attachments(id)',
    )
    .eq('vehicle_id', vehicleId)
    .order('performed_on', { ascending: false })
    .order('created_at', { ascending: false })
    .limit(limit)

  if (error) throw new Error(`service_records failed: ${error.message}`)

  type Raw = Omit<ServiceRecord, 'amount' | 'currency' | 'photo_count'> & {
    expenses: { amount: number; currency: string } | { amount: number; currency: string }[] | null
    attachments: { id: string }[] | null
  }

  return ((data ?? []) as unknown as Raw[]).map((row) => {
    const expense = Array.isArray(row.expenses) ? (row.expenses[0] ?? null) : row.expenses
    const { expenses: _expenses, attachments, ...record } = row
    return {
      ...record,
      amount: expense?.amount ?? null,
      currency: expense?.currency ?? null,
      photo_count: attachments?.length ?? 0,
    }
  })
}

/** One schedule row, for the sheet that edits it. */
export async function fetchServiceSchedule(id: string): Promise<ServiceDue | null> {
  const supabase = await createClient()

  const { data, error } = await supabase
    .from('v_service_due')
    .select(DUE_COLUMNS)
    .eq('schedule_id', id)
    .maybeSingle()

  if (error) throw new Error(`v_service_due failed: ${error.message}`)
  if (!data) return null
  return rowToDue(data as unknown as Record<string, unknown>)
}
