import type { IsoDate } from '@/lib/dates'
import type { Enums } from '@/lib/supabase/types'

/** A sinking fund with its arithmetic done, as `v_fund_status` returns it. */
export type FundStatus = {
  fund_id: string
  name: string
  vehicle_id: string | null
  vehicle_nickname: string | null
  mod_plan_id: string | null
  mod_title: string | null
  mod_status: Enums<'mod_status'> | null
  currency: string
  target_amount: number
  monthly_contribution: number | null
  closed_at: string | null
  created_at: string
  /** Sum of contributions. A drawdown is a negative one. */
  balance: number
  contribution_count: number
  last_contributed_on: IsoDate | null
  remaining: number
  /** Balance over target, to four places. Null when the target is zero. */
  progress: number | null
  /** Null when there is no contribution rate to divide by. */
  months_remaining: number | null
  /** The month the fund lands in at the current rate. Null when there is no rate. */
  projected_on: IsoDate | null
}

/** One logged contribution or drawdown. */
export type FundContribution = {
  id: string
  fund_id: string
  occurred_on: IsoDate
  amount: number
  note: string | null
  created_at: string
}

/**
 * A fund offered to the mark-installed flow, so the expense that pays for a mod
 * can draw the fund down in the same tap. See docs/01-PRODUCT.md, section G.
 */
export type FundOffer = {
  fund_id: string
  name: string
  balance: number
  currency: string
}
