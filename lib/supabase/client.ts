'use client'

import { createBrowserClient } from '@supabase/ssr'
import { env } from '@/lib/env'
import type { Database } from '@/lib/supabase/types'

/**
 * Browser client. Safe to call repeatedly — @supabase/ssr memoises the instance
 * per set of arguments, so components do not need to hoist it into a module.
 */
export function createClient() {
  return createBrowserClient<Database>(
    env.NEXT_PUBLIC_SUPABASE_URL,
    env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
  )
}
