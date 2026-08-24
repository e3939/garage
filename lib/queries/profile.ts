import 'server-only'

import { createClient } from '@/lib/supabase/server'
import { DEFAULT_CURRENCY, DEFAULT_LOCALE } from '@/lib/money'
import { APP_TIMEZONE } from '@/lib/dates'

export type ProfilePreferences = {
  baseCurrency: string
  locale: string
  timezone: string
  amortiseSuggestMultiplier: number
}

const FALLBACK: ProfilePreferences = {
  baseCurrency: DEFAULT_CURRENCY,
  locale: DEFAULT_LOCALE,
  timezone: APP_TIMEZONE,
  amortiseSuggestMultiplier: 3,
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
    .select('base_currency, locale, timezone, amortise_suggest_multiplier')
    .maybeSingle()

  if (error || !data) return FALLBACK

  return {
    baseCurrency: data.base_currency ?? FALLBACK.baseCurrency,
    locale: data.locale ?? FALLBACK.locale,
    timezone: data.timezone ?? FALLBACK.timezone,
    amortiseSuggestMultiplier: Number(data.amortise_suggest_multiplier ?? FALLBACK.amortiseSuggestMultiplier),
  }
}
