import 'server-only'

import { timingSafeEqual } from 'node:crypto'
import { NextResponse } from 'next/server'

import { todayIso } from '@/lib/dates'
import { createAdminClient } from '@/lib/supabase/admin'

/**
 * Generate the drafts that have come due.
 *
 * The scheduled path is pg_cron, set up in migration 0017: it calls
 * `generate_due_recurrences()` directly inside Postgres every day at 00:05
 * Asia/Ho_Chi_Minh, which needs no HTTP and no secret stored in the database.
 * This endpoint is the same job triggered from outside — a platform scheduler,
 * or a person catching up after the database was asleep — and it is the only
 * place in the app that holds `SUPABASE_SECRET_KEY`.
 *
 * Two locks, and both are needed for different reasons:
 *
 * - **`CRON_SECRET`** decides who may ask. Without it this is an unauthenticated
 *   endpoint that writes rows into every user's ledger, which is a denial of
 *   service at best. If the variable is not set the endpoint refuses to run at
 *   all rather than defaulting to open.
 * - **`SUPABASE_SECRET_KEY`** decides what the work runs as. The job spans every
 *   user's templates and has no session to act on behalf of, so it cannot go
 *   through the anon key and RLS. It comes in through `lib/supabase/admin.ts`,
 *   which is `server-only` and is the only module that names the key.
 *
 * Nothing this endpoint writes is visible until a person confirms it. Drafts are
 * out of every view and every total in the app; the tray on `/today` is the only
 * screen that can see one. "Never silently created" (docs/01-PRODUCT.md).
 */

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * Constant time, so a wrong secret cannot be found one character at a time.
 * Lengths are compared first because `timingSafeEqual` throws on a mismatch —
 * the length of a secret is not the part worth hiding.
 */
function secretMatches(offered: string, expected: string): boolean {
  const a = Buffer.from(offered)
  const b = Buffer.from(expected)
  if (a.length !== b.length) return false
  return timingSafeEqual(a, b)
}

/** `Authorization: Bearer <secret>`, which is what a platform scheduler sends. */
function offeredSecret(request: Request): string | null {
  const header = request.headers.get('authorization')
  if (header?.startsWith('Bearer ')) return header.slice('Bearer '.length)
  return request.headers.get('x-cron-secret')
}

async function run(request: Request): Promise<NextResponse> {
  const expected = process.env.CRON_SECRET

  if (!expected) {
    return NextResponse.json(
      { ok: false, error: 'CRON_SECRET is not configured' },
      { status: 503 },
    )
  }

  const offered = offeredSecret(request)
  if (!offered || !secretMatches(offered, expected)) {
    return NextResponse.json({ ok: false, error: 'Not authorised' }, { status: 401 })
  }

  const supabase = createAdminClient()

  // The calendar day in Asia/Ho_Chi_Minh, decided here rather than left to the
  // database's UTC clock, so a job fired at 23:30 UTC on the 31st does not
  // generate the 1st's drafts a day early. The function defaults to the same
  // timezone when the argument is absent; passing it makes the run reproducible.
  const today = todayIso()

  const { data, error } = await supabase.rpc('generate_due_recurrences', { p_today: today })

  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 })
  }

  const drafts = data ?? []

  return NextResponse.json({
    ok: true,
    today,
    created: drafts.length,
  })
}

export async function GET(request: Request): Promise<NextResponse> {
  return run(request)
}

export async function POST(request: Request): Promise<NextResponse> {
  return run(request)
}
