'use server'

/**
 * Every vehicle write in the app goes through one of these.
 *
 * Thin, like the expense actions: parse with the shared zod schema, stamp the
 * user, write, revalidate. The two invariants the database holds — a purchase
 * reading at or below the current one, and a nickname that is actually a name —
 * are checked by the schema first so the error is a sentence rather than a
 * constraint name, and by the constraint anyway so a request that skipped the
 * form cannot get past it.
 */

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { forgetSignedUrl } from '@/lib/storage/signed-url'
import {
  vehicleArchiveSchema,
  vehicleIdSchema,
  vehicleSellSchema,
  vehicleWriteSchema,
  type VehicleWrite,
} from '@/lib/vehicles/schema'
import type { ActionResult } from '@/app/(app)/expenses/actions'

/** The screens a vehicle write can change. Totals move on every one of them. */
function revalidateVehicleScreens(): void {
  revalidatePath('/garage', 'layout')
  revalidatePath('/today')
  revalidatePath('/ledger')
  revalidatePath('/money')
}

async function currentUserId(): Promise<string | null> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  return user?.id ?? null
}

function firstIssue(error: unknown): string {
  if (error && typeof error === 'object' && 'issues' in error) {
    const issues = (error as { issues: { message: string }[] }).issues
    return issues[0]?.message ?? 'That vehicle is not valid'
  }
  return 'That vehicle is not valid'
}

/** Constraint names are not copy. These two are the ones a person can reach. */
function describe(message: string): string {
  if (message.includes('vehicles_purchase_odometer_check')) {
    return 'The reading at purchase cannot be higher than the current reading'
  }
  return message
}

function toRow(input: VehicleWrite, userId: string) {
  return {
    id: input.id,
    user_id: userId,
    nickname: input.nickname,
    make: input.make,
    model: input.model,
    year: input.year,
    trim: input.trim,
    plate: input.plate,
    colour_hex: input.colour_hex,
    fuel_type: input.fuel_type,
    transmission: input.transmission,
    purchase_date: input.purchase_date,
    purchase_price: input.purchase_price,
    // A currency with no price on it is noise; a price with no currency is a
    // number nobody can read. They travel together or not at all.
    currency: input.purchase_price === null ? null : input.currency,
    odometer_km: input.odometer_km,
    purchase_odometer_km: input.purchase_odometer_km,
    hero_photo_path: input.hero_photo_path,
  }
}

export async function createVehicleAction(raw: unknown): Promise<ActionResult> {
  const parsed = vehicleWriteSchema.safeParse(raw)
  if (!parsed.success) return { ok: false, error: firstIssue(parsed.error) }

  const userId = await currentUserId()
  if (!userId) return { ok: false, error: 'Sign in again to save this' }

  const supabase = await createClient()

  // New cars go to the end of the garage rather than the front: the order is the
  // order you added them, and a switcher that reshuffles itself is a switcher
  // nobody develops muscle memory for.
  const { count } = await supabase
    .from('vehicles')
    .select('id', { count: 'exact', head: true })
    .is('archived_at', null)

  const { error } = await supabase
    .from('vehicles')
    .insert({ ...toRow(parsed.data, userId), sort_order: count ?? 0 })

  if (error) return { ok: false, error: describe(error.message) }

  revalidateVehicleScreens()
  return { ok: true }
}

export async function updateVehicleAction(raw: unknown): Promise<ActionResult> {
  const parsed = vehicleWriteSchema.safeParse(raw)
  if (!parsed.success) return { ok: false, error: firstIssue(parsed.error) }

  const userId = await currentUserId()
  if (!userId) return { ok: false, error: 'Sign in again to save this' }

  const supabase = await createClient()

  // Read the old photo path before overwriting it, so a replaced hero can be
  // taken out of storage rather than left there paying rent forever.
  const { data: existing } = await supabase
    .from('vehicles')
    .select('hero_photo_path')
    .eq('id', parsed.data.id)
    .maybeSingle()

  const { user_id: _userId, id, ...columns } = toRow(parsed.data, userId)
  const { error } = await supabase.from('vehicles').update(columns).eq('id', id)
  if (error) return { ok: false, error: describe(error.message) }

  const previousPath = existing?.hero_photo_path ?? null
  if (previousPath && previousPath !== parsed.data.hero_photo_path) {
    await supabase.storage.from('vehicles').remove([previousPath])
    forgetSignedUrl('vehicles', previousPath)
  }

  revalidateVehicleScreens()
  return { ok: true }
}

/**
 * Archive, not delete. Expenses point at a vehicle and a car that stopped being
 * yours did not stop having cost you money — the whole point of the app is the
 * log. `archived_at` takes it out of the garage and out of the expense form and
 * leaves every figure it earned intact.
 */
export async function setVehicleArchivedAction(raw: unknown): Promise<ActionResult> {
  const parsed = vehicleArchiveSchema.safeParse(raw)
  if (!parsed.success) return { ok: false, error: 'Unknown vehicle' }

  const supabase = await createClient()
  const { error } = await supabase
    .from('vehicles')
    .update({ archived_at: parsed.data.archived ? new Date().toISOString() : null })
    .eq('id', parsed.data.id)

  if (error) return { ok: false, error: describe(error.message) }

  revalidateVehicleScreens()
  return { ok: true }
}

/**
 * A hero photo that was uploaded and then abandoned — the form was closed before
 * Save — is removed by the browser calling this. Storage RLS keys on the first
 * path segment being the caller's user id, so this can only ever reach the
 * caller's own objects.
 */
export async function discardVehiclePhotoAction(rawPath: unknown): Promise<ActionResult> {
  if (typeof rawPath !== 'string' || rawPath === '') return { ok: false, error: 'Unknown photo' }

  const supabase = await createClient()
  const { error } = await supabase.storage.from('vehicles').remove([rawPath])
  if (error) return { ok: false, error: error.message }

  forgetSignedUrl('vehicles', rawPath)
  return { ok: true }
}

/**
 * Sold.
 *
 * Three columns and one archive, in one update: the date, the price, the status,
 * and `archived_at` so the car leaves the garage and the expense form the way an
 * archived car does. Nothing is deleted and nothing is recalculated — every
 * expense the car earned stays exactly where it is, which is what makes the
 * closing summary true.
 *
 * There is deliberately no expense written for the sale. A car sold for money is
 * not a negative running cost — a part sold on is, and `parts` does exactly that
 * — and folding a sale into the ledger would put a large negative row in a month
 * and quietly flatter every figure that month carries. The sale lives on the
 * vehicle, and `v_vehicle_closing` is where it is netted off.
 */
export async function sellVehicleAction(raw: unknown): Promise<ActionResult> {
  const parsed = vehicleSellSchema.safeParse(raw)
  if (!parsed.success) return { ok: false, error: firstIssue(parsed.error) }

  const supabase = await createClient()

  // A price with no currency is a number nobody can read, so the two travel
  // together as they do on the purchase side. With no price, the column is left
  // exactly as the purchase set it rather than being overwritten.
  const sale = {
    status: 'sold' as const,
    sold_date: parsed.data.sold_date,
    sold_price: parsed.data.sold_price,
    archived_at: new Date().toISOString(),
  }

  const { error } = await supabase
    .from('vehicles')
    .update(parsed.data.sold_price === null ? sale : { ...sale, currency: parsed.data.currency })
    .eq('id', parsed.data.id)

  if (error) return { ok: false, error: describe(error.message) }

  revalidateVehicleScreens()
  return { ok: true }
}

/**
 * Sold by mistake, or bought back. Puts the car in the garage as it was and
 * clears the sale, because a sale that did not happen should leave no trace —
 * a `sold_date` on an owned car would sit in `months_owned` forever.
 */
export async function unsellVehicleAction(raw: unknown): Promise<ActionResult> {
  const parsed = vehicleIdSchema.safeParse(raw)
  if (!parsed.success) return { ok: false, error: 'Unknown vehicle' }

  const supabase = await createClient()
  const { error } = await supabase
    .from('vehicles')
    .update({ status: 'owned', sold_date: null, sold_price: null, archived_at: null })
    .eq('id', parsed.data)

  if (error) return { ok: false, error: describe(error.message) }

  revalidateVehicleScreens()
  return { ok: true }
}
