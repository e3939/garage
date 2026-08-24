import 'server-only'

import { createClient } from '@/lib/supabase/server'
import type { VehicleOption } from '@/lib/expenses/types'

/**
 * The vehicles an expense may be attached to. Vehicle CRUD is roadmap Phase 3;
 * this read exists so an expense logged before then can still name a car that
 * was created in Studio.
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
