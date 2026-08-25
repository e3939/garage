'use server'

/**
 * Preferences that the app changes for you rather than asking about in Settings.
 *
 * There is exactly one so far: the view switcher writes its choice back to
 * `profiles.default_view` on every change, so the view you last looked at is the
 * view the next screen — and the next session, and the other device — opens on.
 * docs/03-DESIGN.md: "Its state persists in the URL and in `profiles`."
 */

import { createClient } from '@/lib/supabase/server'
import { defaultViewSchema } from '@/lib/vehicles/schema'
import type { ActionResult } from '@/app/(app)/expenses/actions'

/**
 * Deliberately does not revalidate anything. The URL already carries the new
 * view and the screen has already re-rendered with it; this only moves the
 * fallback for next time, and re-rendering the page a second time to record a
 * preference the user can already see the effect of would be a visible stutter
 * for no information.
 */
export async function setDefaultViewAction(raw: unknown): Promise<ActionResult> {
  const parsed = defaultViewSchema.safeParse(raw)
  if (!parsed.success) return { ok: false, error: 'Unknown view' }

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { ok: false, error: 'Sign in again' }

  const { error } = await supabase
    .from('profiles')
    .update({ default_view: parsed.data })
    .eq('id', user.id)

  if (error) return { ok: false, error: error.message }
  return { ok: true }
}
