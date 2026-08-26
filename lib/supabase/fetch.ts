/**
 * The fetch every server-side Supabase client uses.
 *
 * Two things the default does not do, both of which showed up in production
 * rather than locally, because locally the database is a Docker container
 * three milliseconds away and nothing is ever transient.
 *
 * **A timeout.** supabase-js has none, and neither does undici by default. A
 * connection that stalls holds the render open until the platform kills the
 * whole function, so one slow query becomes a blank page instead of one failed
 * panel.
 *
 * **One retry.** The failure seen in the Vercel log was
 * `JWT issued at future` — PostgREST refusing a token whose `iat` claim is
 * ahead of PostgREST's own clock by a fraction of a second. It comes from clock
 * skew between the service that mints the token and the one that checks it, it
 * is not something this application can prevent, and it resolves on its own
 * within a moment. Without a retry it is an error card; with one it is a
 * quarter-second hiccup nobody sees.
 *
 * What is deliberately NOT retried: a 4xx that means what it says, and any
 * write. A retried POST is a duplicate expense. The one exception is the
 * authentication rejection above, which is safe for any method precisely
 * because the request was refused at the gate and never reached the database.
 */

const TIMEOUT_MS = 8_000

/** Long enough for a skewed clock to catch up, short enough to be invisible. */
const CLOCK_SKEW_BACKOFF_MS = 250
const TRANSIENT_BACKOFF_MS = 150

/** PostgREST and GoTrue phrasings for "your token is not valid right now". */
const CLOCK_SKEW = /JWT issued at future|JWTIssuedAtFuture|PGRST301|JWSError/i

function isRead(method: string): boolean {
  return method === 'GET' || method === 'HEAD'
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

/**
 * A response body can only be read once, so inspecting it means handing back a
 * replacement. Content-encoding and length are dropped because the text is
 * already decoded and re-declaring them would describe the new body wrongly.
 */
async function readBackResponse(response: Response): Promise<{ text: string; replay: Response }> {
  const text = await response.text()
  const headers = new Headers(response.headers)
  headers.delete('content-encoding')
  headers.delete('content-length')
  return {
    text,
    replay: new Response(text, {
      status: response.status,
      statusText: response.statusText,
      headers,
    }),
  }
}

function withTimeout(init: RequestInit | undefined): RequestInit {
  const timeout = AbortSignal.timeout(TIMEOUT_MS)
  const caller = init?.signal
  return {
    ...init,
    signal: caller ? AbortSignal.any([caller, timeout]) : timeout,
  }
}

export function createSupabaseFetch(): typeof fetch {
  return async function supabaseFetch(input, init) {
    const method = (init?.method ?? 'GET').toUpperCase()

    let response: Response
    try {
      response = await fetch(input, withTimeout(init))
    } catch (error) {
      // A throw here is a network failure or the timeout above: the request
      // may never have landed, so only a read is safe to repeat.
      if (!isRead(method)) throw error
      await sleep(TRANSIENT_BACKOFF_MS)
      return fetch(input, withTimeout(init))
    }

    if (response.status === 401 || response.status === 403) {
      const { text, replay } = await readBackResponse(response)
      if (!CLOCK_SKEW.test(text)) return replay
      await sleep(CLOCK_SKEW_BACKOFF_MS)
      return fetch(input, withTimeout(init))
    }

    if (isRead(method) && (response.status >= 500 || response.status === 408)) {
      await sleep(TRANSIENT_BACKOFF_MS)
      return fetch(input, withTimeout(init))
    }

    return response
  }
}
