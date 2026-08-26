'use server'

/**
 * Every maintenance write in the app goes through one of these.
 *
 * Same shape as the expense, vehicle and mod actions — parse with the shared zod
 * schema, stamp the user, write, revalidate — with one thing of its own.
 *
 * Marking a service done writes a record and, if the sheet asked for it, the
 * expense that paid for it, in a single call. docs/01-PRODUCT.md: "Completing a
 * service creates a service record and optionally an expense in one step." One
 * flow, one confirmation, so the two cannot land half-done and leave an oil
 * change with no money against it or an expense with no history behind it.
 *
 * The schedule's `last_done_km` and `last_done_on` are not written here. A
 * trigger recomputes them from the records (migration 0016), which is what
 * docs/02-DATA-MODEL.md asks for and what makes back-dating and deleting a
 * record come out right.
 */

import { revalidatePath } from 'next/cache'

import { createClient } from '@/lib/supabase/server'
import { syncAttachments } from '@/lib/attachments/server'
import {
  markServiceDoneSchema,
  serviceRecordIdSchema,
  serviceRecordSchema,
  serviceScheduleArchiveSchema,
  serviceScheduleSchema,
  type ServiceRecordWrite,
  type ServiceScheduleWrite,
} from '@/lib/service/schema'
import type { ExpenseWrite } from '@/lib/expenses/schema'
import type { ActionResult } from '@/app/(app)/expenses/actions'
import { collect, snapshot, snapshotAttachments } from '@/app/(app)/undo/snapshot'

/**
 * The screens a service write can change: the schedule, the vehicle home's due
 * gauge, and the build log, which carries a row per service record. An expense
 * written alongside moves the ledger and the month as well.
 */
function revalidateServiceScreens(withExpense = false): void {
  revalidatePath('/garage', 'layout')
  if (withExpense) {
    revalidatePath('/today')
    revalidatePath('/ledger')
    revalidatePath('/money')
  }
}

async function currentUserId(): Promise<string | null> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  return user?.id ?? null
}

function firstIssue(error: unknown, fallback: string): string {
  if (error && typeof error === 'object' && 'issues' in error) {
    const issues = (error as { issues: { message: string }[] }).issues
    return issues[0]?.message ?? fallback
  }
  return fallback
}

/** Constraint names are not copy. This is the one a person can reach. */
function describe(message: string): string {
  if (message.includes('service_schedules_interval_check')) {
    return 'Give it a distance, a time, or both'
  }
  return message
}

function scheduleRow(input: ServiceScheduleWrite, userId: string) {
  return {
    id: input.id,
    user_id: userId,
    vehicle_id: input.vehicle_id,
    name: input.name,
    interval_km: input.interval_km,
    interval_months: input.interval_months,
    last_done_km: input.last_done_km,
    last_done_on: input.last_done_on,
    notes: input.notes,
  }
}

function recordRow(input: ServiceRecordWrite, userId: string) {
  return {
    id: input.id,
    user_id: userId,
    vehicle_id: input.vehicle_id,
    schedule_id: input.schedule_id,
    name: input.name,
    performed_on: input.performed_on,
    odometer_km: input.odometer_km,
    workshop: input.workshop,
    notes: input.notes,
  }
}

export async function createServiceScheduleAction(raw: unknown): Promise<ActionResult> {
  const parsed = serviceScheduleSchema.safeParse(raw)
  if (!parsed.success) return { ok: false, error: firstIssue(parsed.error, 'That schedule is not valid') }

  const userId = await currentUserId()
  if (!userId) return { ok: false, error: 'Sign in again to save this' }

  const supabase = await createClient()
  const { error } = await supabase.from('service_schedules').insert(scheduleRow(parsed.data, userId))
  if (error) return { ok: false, error: describe(error.message) }

  revalidateServiceScreens()
  return { ok: true }
}

export async function updateServiceScheduleAction(raw: unknown): Promise<ActionResult> {
  const parsed = serviceScheduleSchema.safeParse(raw)
  if (!parsed.success) return { ok: false, error: firstIssue(parsed.error, 'That schedule is not valid') }

  const userId = await currentUserId()
  if (!userId) return { ok: false, error: 'Sign in again to save this' }

  const supabase = await createClient()
  const { user_id: _userId, id, ...columns } = scheduleRow(parsed.data, userId)
  const { error } = await supabase.from('service_schedules').update(columns).eq('id', id)
  if (error) return { ok: false, error: describe(error.message) }

  revalidateServiceScreens()
  return { ok: true }
}

/**
 * "Every row editable and deletable" (the phase brief), and the deletable half
 * is an archive.
 *
 * A schedule that has been marked done has service records pointing at it, and
 * those are history — a hard delete would either be refused by the foreign key
 * or take the record's link with it. `archived_at` takes the row off the
 * schedule, out of `v_service_due` and out of the gauge, which is every visible
 * consequence of a delete, and the undo is one tap.
 */
export async function setServiceScheduleArchivedAction(raw: unknown): Promise<ActionResult> {
  const parsed = serviceScheduleArchiveSchema.safeParse(raw)
  if (!parsed.success) return { ok: false, error: 'Unknown schedule' }

  const supabase = await createClient()
  const { error } = await supabase
    .from('service_schedules')
    .update({ archived_at: parsed.data.archived ? new Date().toISOString() : null })
    .eq('id', parsed.data.id)

  if (error) return { ok: false, error: error.message }

  revalidateServiceScreens()
  return { ok: true }
}

/**
 * Mark done: the record, the photos, and optionally the expense, in one call.
 *
 * The expense goes first. If it fails the record is not written, and the user is
 * looking at a sheet that still holds everything they typed; the other order
 * would leave a service record claiming an expense id that does not exist.
 */
export async function markServiceDoneAction(
  raw: unknown,
  rawAttachments: unknown = [],
): Promise<ActionResult> {
  const parsed = markServiceDoneSchema.safeParse(raw)
  if (!parsed.success) return { ok: false, error: firstIssue(parsed.error, 'That service is not valid') }

  const userId = await currentUserId()
  if (!userId) return { ok: false, error: 'Sign in again to save this' }

  const supabase = await createClient()
  const { record, expense } = parsed.data

  let expenseId: string | null = null
  if (expense) {
    const { error } = await supabase.from('expenses').insert(expenseRow(expense, userId))
    if (error) return { ok: false, error: error.message }
    expenseId = expense.id
  }

  const { error } = await supabase
    .from('service_records')
    .insert({ ...recordRow(record, userId), expense_id: expenseId })

  if (error) {
    // The expense was written a moment ago and is now paying for nothing. Take
    // it back out rather than leaving a mystery row in the ledger.
    if (expenseId) await supabase.from('expenses').delete().eq('id', expenseId)
    return { ok: false, error: error.message }
  }

  const photoError = await syncAttachments('service_record', record.id, userId, rawAttachments)
  if (photoError) return { ok: false, error: photoError }

  revalidateServiceScreens(expense !== null)
  return { ok: true }
}

/** The expense half of a combined write. The same columns the ledger writes. */
function expenseRow(input: ExpenseWrite, userId: string) {
  return {
    id: input.id,
    user_id: userId,
    occurred_on: input.occurred_on,
    amount: input.amount,
    currency: input.currency,
    category_id: input.category_id,
    vehicle_id: input.vehicle_id,
    bucket: input.bucket,
    counts_toward_budget: input.counts_toward_budget,
    amortize_months: input.amortize_months,
    merchant: input.merchant,
    note: input.note,
    odometer_km: input.odometer_km,
    ...(input.mod_plan_id === undefined ? {} : { mod_plan_id: input.mod_plan_id }),
  }
}

export async function updateServiceRecordAction(
  raw: unknown,
  rawAttachments: unknown = [],
): Promise<ActionResult> {
  const parsed = serviceRecordSchema.safeParse(raw)
  if (!parsed.success) return { ok: false, error: firstIssue(parsed.error, 'That service is not valid') }

  const userId = await currentUserId()
  if (!userId) return { ok: false, error: 'Sign in again to save this' }

  const supabase = await createClient()
  const { user_id: _userId, id, ...columns } = recordRow(parsed.data, userId)
  const { error } = await supabase.from('service_records').update(columns).eq('id', id)
  if (error) return { ok: false, error: error.message }

  const photoError = await syncAttachments('service_record', id, userId, rawAttachments)
  if (photoError) return { ok: false, error: photoError }

  revalidateServiceScreens()
  return { ok: true }
}

/**
 * Delete a service record. The expense it paid for is deliberately left alone:
 * money that left the account is not undone by correcting the logbook, and the
 * ledger is where a wrong expense is deleted.
 */
export async function deleteServiceRecordAction(rawId: unknown): Promise<ActionResult> {
  const parsed = serviceRecordIdSchema.safeParse(rawId)
  if (!parsed.success) return { ok: false, error: 'Unknown service record' }

  const supabase = await createClient()

  const undo = collect(
    await snapshot('service_records', { id: parsed.data }),
    await snapshotAttachments('service_record_id', parsed.data),
  )

  const { error } = await supabase.from('service_records').delete().eq('id', parsed.data)
  if (error) return { ok: false, error: error.message }

  revalidateServiceScreens()
  return { ok: true, undo }
}
