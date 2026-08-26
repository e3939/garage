import 'server-only'

import { createClient as createSupabaseClient } from '@supabase/supabase-js'

import { env } from '@/lib/env'
import type { Database } from '@/lib/supabase/types'

/**
 * The one client in this codebase that bypasses row-level security.
 *
 * `import 'server-only'` on the first line is not decoration. It makes the
 * bundler refuse to build if any Client Component ever pulls this module into
 * its graph, directly or through six layers of re-export — the failure is a
 * build error naming the file, not a key quietly shipped to a browser. The CI
 * check in `scripts/check-secret-key.mjs` is the second lock: it fails the build
 * if the secret key is named in a file that lacks this import, is marked
 * `'use client'`, or has been given a `NEXT_PUBLIC_` prefix.
 *
 * docs/05-OPS.md sets the rules this file exists to keep:
 *
 *   Never prefixed NEXT_PUBLIC_
 *   Never imported into a file that lacks `import 'server-only'` at the top
 *   Only used by the recurring-expense cron job and CSV import
 *
 * Today that is one caller: `app/api/cron/recurring`, which runs
 * `generate_due_recurrences` across every user's templates and therefore cannot
 * have a session to act on behalf of. Everything else in the app — every screen,
 * every server action — uses `lib/supabase/server.ts` and is bound by RLS.
 *
 * Supabase renamed its keys: `service_role` became `secret`. Both spellings are
 * read, matching how `lib/env.ts` accepts both spellings of the public one.
 */

function secretKey(): string {
  const key = process.env.SUPABASE_SECRET_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!key) {
    throw new Error(
      'SUPABASE_SECRET_KEY is not set. It is needed only by the cron endpoint; ' +
        'see .env.example and docs/05-OPS.md.',
    )
  }

  return key
}

/**
 * Created per call, never cached in a module. There is no session to leak here,
 * but the habit is the same one `lib/supabase/server.ts` keeps and it costs
 * nothing.
 */
export function createAdminClient() {
  return createSupabaseClient<Database>(env.NEXT_PUBLIC_SUPABASE_URL, secretKey(), {
    auth: {
      // No cookies, no refresh, no storage. This client is a script, not a user.
      persistSession: false,
      autoRefreshToken: false,
    },
  })
}
