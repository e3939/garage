/**
 * Measure the JavaScript each route actually downloads.
 *
 * `next build` no longer prints per-route first-load JS, and a number read off a
 * chunk manifest is not the number a phone pays: what a phone pays is the set of
 * `<script src>` tags in the HTML the route renders, gzipped. So this script
 * builds nothing and guesses nothing — it starts the production server, signs in
 * the way the app signs a person in, fetches every route, and weighs exactly the
 * files those pages ask for.
 *
 * The split is the point. Almost all of the weight is the React and Next runtime
 * that every route shares and no application change can move; the interesting
 * figure is what a route adds on top of it. Chunks common to every measured
 * route are the shared baseline, the rest is the route's own, and CLAUDE.md §3
 * budgets those two separately.
 *
 *   npm run build && node scripts/measure-bundles.mjs
 *
 * Needs the local Supabase stack up (`npx supabase start`).
 */

import { execFileSync, spawn } from 'node:child_process'
import { gzipSync } from 'node:zlib'
import { readFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'

const PORT = Number(process.env.MEASURE_PORT ?? 3987)
const ORIGIN = `http://127.0.0.1:${PORT}`
/**
 * `/garage/<id>` is filled in once the probe vehicle exists. The garage list and
 * the vehicle form are separate routes and separate bundles, so both are weighed.
 */
const ROUTES = [
  '/today',
  '/ledger',
  '/garage',
  '/garage/new',
  '/money',
  '/settings',
  '/settings/categories',
]

function stack() {
  const raw = execFileSync('npx', ['supabase', 'status', '-o', 'json'], {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'ignore'],
  })
  const status = JSON.parse(raw.slice(raw.indexOf('{')))
  return {
    apiUrl: status.API_URL ?? 'http://127.0.0.1:54321',
    secretKey: status.SECRET_KEY ?? status.SERVICE_ROLE_KEY,
  }
}

/** A confirmed user and a one-shot token for it, straight from the admin API. */
async function signInToken({ apiUrl, secretKey }) {
  const email = `measure-${Math.random().toString(36).slice(2, 10)}@garage.test`
  const headers = {
    apikey: secretKey,
    authorization: `Bearer ${secretKey}`,
    'content-type': 'application/json',
  }

  const created = await fetch(`${apiUrl}/auth/v1/admin/users`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ email, email_confirm: true }),
  })
  if (!created.ok) throw new Error(`create user: ${created.status} ${await created.text()}`)

  const link = await fetch(`${apiUrl}/auth/v1/admin/generate_link`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ type: 'magiclink', email }),
  })
  if (!link.ok) throw new Error(`generate link: ${link.status} ${await link.text()}`)

  const { hashed_token: hashedToken } = await link.json()
  const { id: userId } = await created.json()
  return { hashedToken, userId }
}

/**
 * The garage redirects an empty garage to the form, so a probe user with no cars
 * would measure a redirect rather than the screen. One vehicle makes `/garage`
 * and `/garage/<id>` real.
 */
async function probeVehicle({ apiUrl, secretKey }, userId) {
  const response = await fetch(`${apiUrl}/rest/v1/vehicles`, {
    method: 'POST',
    headers: {
      apikey: secretKey,
      authorization: `Bearer ${secretKey}`,
      'content-type': 'application/json',
      prefer: 'return=representation',
    },
    body: JSON.stringify({ user_id: userId, nickname: 'Bundle probe', odometer_km: 10000 }),
  })
  if (!response.ok) throw new Error(`probe vehicle: ${response.status} ${await response.text()}`)
  const [vehicle] = await response.json()
  return vehicle.id
}

async function waitForServer() {
  for (let attempt = 0; attempt < 120; attempt += 1) {
    try {
      const response = await fetch(`${ORIGIN}/sign-in`, { redirect: 'manual' })
      if (response.status < 500) return
    } catch {
      // not listening yet
    }
    await new Promise((resolve) => setTimeout(resolve, 250))
  }
  throw new Error('next start never came up')
}

/** The cookie jar, kept as a plain name=value map. */
function absorb(jar, response) {
  for (const line of response.headers.getSetCookie()) {
    const [pair] = line.split(';')
    const index = pair.indexOf('=')
    const name = pair.slice(0, index).trim()
    const value = pair.slice(index + 1)
    if (value === '' || value === 'deleted') delete jar[name]
    else jar[name] = value
  }
}

function cookieHeader(jar) {
  return Object.entries(jar)
    .map(([name, value]) => `${name}=${value}`)
    .join('; ')
}

/** Every `<script src>` the page asks for, minus the nomodule polyfill bundle. */
function scriptSources(html) {
  const sources = []
  for (const tag of html.matchAll(/<script\b[^>]*>/g)) {
    const text = tag[0]
    // `noModule=""` in the rendered HTML: the legacy-browser polyfill bundle,
    // which no browser that can run this app ever fetches.
    if (/\bnomodule\b/i.test(text)) continue
    const src = text.match(/\bsrc="([^"]+)"/)
    if (src) sources.push(src[1])
  }
  return [...new Set(sources)]
}

function gzippedBytes(src) {
  const file = join(process.cwd(), '.next', src.replace(/^\/_next\//, '').split('?')[0])
  if (!existsSync(file)) throw new Error(`no such chunk on disk: ${file}`)
  return gzipSync(readFileSync(file), { level: 9 }).length
}

const kb = (bytes) => `${(bytes / 1024).toFixed(1)}KB`

async function main() {
  if (!existsSync(join(process.cwd(), '.next', 'BUILD_ID'))) {
    throw new Error('no production build found — run `npm run build` first')
  }

  const local = stack()
  const { hashedToken, userId } = await signInToken(local)
  const vehicleId = await probeVehicle(local, userId)
  ROUTES.splice(ROUTES.indexOf('/garage') + 1, 0, `/garage/${vehicleId}`)

  const server = spawn('npx', ['next', 'start', '-p', String(PORT)], {
    stdio: ['ignore', 'ignore', 'inherit'],
  })

  try {
    await waitForServer()

    const jar = {}
    const callback = await fetch(
      `${ORIGIN}/auth/callback?token_hash=${hashedToken}&type=magiclink`,
      { redirect: 'manual' },
    )
    absorb(jar, callback)
    const landing = callback.headers.get('location') ?? ''
    if (landing.includes('/sign-in')) throw new Error(`sign-in failed: ${landing}`)

    const perRoute = new Map()
    for (const route of ROUTES) {
      const response = await fetch(`${ORIGIN}${route}`, {
        headers: { cookie: cookieHeader(jar) },
        redirect: 'manual',
      })
      if (response.status !== 200) {
        throw new Error(`${route} answered ${response.status}`)
      }
      absorb(jar, response)
      perRoute.set(route, scriptSources(await response.text()))
    }

    const shared = [...perRoute.values()].reduce((common, sources) =>
      common.filter((src) => sources.includes(src)),
    )
    const baseline = shared.reduce((total, src) => total + gzippedBytes(src), 0)

    console.log(`Shared baseline: ${kb(baseline)} gzipped across ${shared.length} chunks`)
    console.log('')
    console.log('Route                   own JS      total')
    for (const [route, sources] of perRoute) {
      const own = sources
        .filter((src) => !shared.includes(src))
        .reduce((total, src) => total + gzippedBytes(src), 0)
      const label = route.startsWith('/garage/') && route !== '/garage/new'
        ? '/garage/[vehicleId]'
        : route
      console.log(
        `${label.padEnd(24)}${kb(own).padStart(7)}${kb(own + baseline).padStart(11)}`,
      )
    }
  } finally {
    server.kill('SIGTERM')
  }
}

await main()
