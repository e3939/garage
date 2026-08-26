import 'server-only'

import { createClient } from '@/lib/supabase/server'
import { currentUser } from '@/lib/queries/session'
import { DEFAULT_CURRENCY, DEFAULT_LOCALE } from '@/lib/money'
import { APP_TIMEZONE } from '@/lib/dates'
import { DEFAULT_SPEND_VIEW, parseSpendView, type SpendView } from '@/lib/views'

export type ProfilePreferences = {
  baseCurrency: string
  locale: string
  timezone: string
  amortiseSuggestMultiplier: number
  /** Which of the three views a screen opens on before the URL says otherwise. */
  defaultView: SpendView
}

const FALLBACK: ProfilePreferences = {
  baseCurrency: DEFAULT_CURRENCY,
  locale: DEFAULT_LOCALE,
  timezone: APP_TIMEZONE,
  amortiseSuggestMultiplier: 3,
  defaultView: DEFAULT_SPEND_VIEW,
}

/**
 * Preferences, with the schema defaults as a fallback. A profile row is created
 * by trigger on sign-up, so its absence means something is wrong upstream —
 * but the expense form should still open.
 */
export async function fetchProfilePreferences(): Promise<ProfilePreferences> {
  const supabase = await createClient()

  const { data, error } = await supabase
    .from('profiles')
    .select('base_currency, locale, timezone, amortise_suggest_multiplier, default_view')
    .maybeSingle()

  if (error || !data) return FALLBACK

  return {
    baseCurrency: data.base_currency ?? FALLBACK.baseCurrency,
    locale: data.locale ?? FALLBACK.locale,
    timezone: data.timezone ?? FALLBACK.timezone,
    amortiseSuggestMultiplier: Number(data.amortise_suggest_multiplier ?? FALLBACK.amortiseSuggestMultiplier),
    defaultView: parseSpendView(data.default_view, FALLBACK.defaultView),
  }
}

/**
 * The signed-in user's id. Not a secret — it is the first segment of every
 * storage path the browser uploads to — but it comes from the session rather
 * than from anything the client sent.
 */
export async function fetchUserId(): Promise<string | null> {
  return (await currentUser())?.id ?? null
}
