import 'server-only'

import { createClient } from '@/lib/supabase/server'
import type { FundContribution, FundOffer, FundStatus } from '@/lib/funds/types'
import type { IsoDate } from '@/lib/dates'

const FUND_COLUMNS = [
  'fund_id',
  'name',
  'vehicle_id',
  'vehicle_nickname',
  'mod_plan_id',
  'mod_title',
  'mod_status',
  'currency',
  'target_amount',
  'monthly_contribution',
  'closed_at',
  'created_at',
  'balance',
  'contribution_count',
  'last_contributed_on',
  'remaining',
  'progress',
  'months_remaining',
  'projected_on',
].join(', ')

/**
 * Every fund, open ones first, each with its balance, progress and the month it
 * lands in. All of that is `v_fund_status` — the balance is a sum of
 * contributions computed in SQL and never stored (docs/02-DATA-MODEL.md), and
 * the projection is the view's arithmetic, not the browser's.
 */
export async function fetchFunds(includeClosed = true): Promise<FundStatus[]> {
  const supabase = await createClient()

  let query = supabase
    .from('v_fund_status')
    .select(FUND_COLUMNS)
    .order('closed_at', { ascending: true, nullsFirst: true })
    .order('progress', { ascending: false, nullsFirst: false })
    .order('created_at', { ascending: true })

  if (!includeClosed) query = query.is('closed_at', null)

  const { data, error } = await query
  if (error) throw new Error(`v_fund_status failed: ${error.message}`)

  return ((data ?? []) as unknown as Record<string, unknown>[]).flatMap(toStatus)
}

export async function fetchFund(fundId: string): Promise<FundStatus | null> {
  const supabase = await createClient()

  const { data, error } = await supabase
    .from('v_fund_status')
    .select(FUND_COLUMNS)
    .eq('fund_id', fundId)
    .maybeSingle()

  if (error) throw new Error(`v_fund_status failed: ${error.message}`)
  if (!data) return null

  return toStatus(data as unknown as Record<string, unknown>)[0] ?? null
}

/** The contribution log for one fund, newest first. */
export async function fetchFundContributions(
  fundId: string,
  limit = 40,
): Promise<FundContribution[]> {
  const supabase = await createClient()

  const { data, error } = await supabase
    .from('fund_contributions')
    .select('id, fund_id, occurred_on, amount, note, created_at')
    .eq('fund_id', fundId)
    .order('occurred_on', { ascending: false })
    .order('created_at', { ascending: false })
    .limit(limit)

  if (error) throw new Error(`fund_contributions failed: ${error.message}`)
  return (data ?? []) as FundContribution[]
}

/**
 * The funds attached to a vehicle's mods, keyed by mod.
 *
 * This is what lets the mark-installed flow offer a drawdown at the moment the
 * expense is written, rather than making somebody remember to go and do it
 * afterwards (docs/01-PRODUCT.md, section G). Only open funds with something in
 * them are offered: drawing down an empty fund records a negative balance and
 * helps nobody.
 */
export async function fetchFundOffersByMod(
  vehicleId: string,
): Promise<Record<string, FundOffer>> {
  const supabase = await createClient()

  const { data, error } = await supabase
    .from('v_fund_status')
    .select('fund_id, name, mod_plan_id, balance, currency, closed_at')
    .eq('vehicle_id', vehicleId)
    .not('mod_plan_id', 'is', null)
    .is('closed_at', null)
    .gt('balance', 0)

  if (error) throw new Error(`v_fund_status failed: ${error.message}`)

  const offers: Record<string, FundOffer> = {}
  for (const row of (data ?? []) as unknown as Record<string, unknown>[]) {
    const modId = row.mod_plan_id as string | null
    const fundId = row.fund_id as string | null
    if (!modId || !fundId) continue
    offers[modId] = {
      fund_id: fundId,
      name: (row.name as string | null) ?? 'Fund',
      balance: (row.balance as number | null) ?? 0,
      currency: (row.currency as string | null) ?? 'VND',
    }
  }

  return offers
}

function toStatus(row: Record<string, unknown>): FundStatus[] {
  const id = row.fund_id as string | null
  if (!id) return []

  return [
    {
      fund_id: id,
      name: (row.name as string | null) ?? 'Fund',
      vehicle_id: (row.vehicle_id as string | null) ?? null,
      vehicle_nickname: (row.vehicle_nickname as string | null) ?? null,
      mod_plan_id: (row.mod_plan_id as string | null) ?? null,
      mod_title: (row.mod_title as string | null) ?? null,
      mod_status: (row.mod_status as FundStatus['mod_status']) ?? null,
      currency: (row.currency as string | null) ?? 'VND',
      target_amount: (row.target_amount as number | null) ?? 0,
      monthly_contribution: (row.monthly_contribution as number | null) ?? null,
      closed_at: (row.closed_at as string | null) ?? null,
      created_at: (row.created_at as string | null) ?? '',
      balance: (row.balance as number | null) ?? 0,
      contribution_count: (row.contribution_count as number | null) ?? 0,
      last_contributed_on: (row.last_contributed_on as IsoDate | null) ?? null,
      remaining: (row.remaining as number | null) ?? 0,
      // `numeric` arrives as a string over PostgREST, and a fraction is arithmetic.
      progress: toNumber(row.progress),
      months_remaining: (row.months_remaining as number | null) ?? null,
      projected_on: (row.projected_on as IsoDate | null) ?? null,
    },
  ]
}

function toNumber(value: unknown): number | null {
  if (value === null || value === undefined) return null
  const parsed = typeof value === 'number' ? value : Number(value)
  return Number.isFinite(parsed) ? parsed : null
}
