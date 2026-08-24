import { z } from 'zod'

/**
 * Environment is validated once, at the edge of the app, so a missing variable
 * is a startup error with a readable message rather than `undefined` surfacing
 * three layers down as a fetch to "undefined/auth/v1".
 *
 * Supabase renamed its keys: `anon` became `publishable`, `service_role` became
 * `secret`. Both spellings are accepted so an older `.env.local` keeps working.
 */

const publicSchema = z.object({
  NEXT_PUBLIC_SUPABASE_URL: z.string().url(),
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: z.string().min(1),
  NEXT_PUBLIC_SITE_URL: z.string().url().optional(),
})

/**
 * Next inlines `process.env.NEXT_PUBLIC_*` only when it is written out in full,
 * so these cannot be read from a loop or a computed key.
 */
const rawPublic = {
  NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY:
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ??
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  NEXT_PUBLIC_SITE_URL: process.env.NEXT_PUBLIC_SITE_URL,
}

const parsed = publicSchema.safeParse(rawPublic)

if (!parsed.success) {
  const missing = Object.keys(z.flattenError(parsed.error).fieldErrors).join(', ')
  throw new Error(
    `Environment is incomplete: ${missing}. Copy .env.example to .env.local and ` +
      'fill it from `npx supabase status`.',
  )
}

export const env = parsed.data

/** Absolute origin used to build magic-link redirects. */
export function siteUrl(): string {
  return env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000'
}
