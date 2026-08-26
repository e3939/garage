import 'server-only'

import { cache } from 'react'

import { createClient } from '@/lib/supabase/server'

/**
 * The signed-in user, fetched once per request.
 *
 * `supabase.auth.getUser()` is a network call to the auth API — it has to be,
 * because verifying a token against the server is the whole point of preferring
 * it to reading the cookie. The authenticated layout makes that call to protect
 * the page, and then a page makes it again through `fetchUserId()` to learn the
 * id it needs for a storage path. Same request, same answer, two round trips
 * before a byte of HTML leaves the server — and on a throttled connection the
 * time to first byte is the largest single input into both First Contentful
 * Paint and Largest Contentful Paint.
 *
 * React's `cache()` scopes a memo to one request, which is exactly the lifetime
 * this answer is good for. It is deliberately not a module-level cache: that
 * would be one user's session leaking into another's, which is the mistake
 * `lib/supabase/server.ts` warns about at the top of the file.
 *
 * The proxy's own call cannot be deduplicated with these — it runs in a
 * different context, before this one exists.
 */
export const currentUser = cache(async () => {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  return user
})
