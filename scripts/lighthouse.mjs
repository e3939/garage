/**
 * A Lighthouse mobile run against the real app.
 *
 * `docs/04-ROADMAP.md` ends Phase 8 with "a Lighthouse mobile run clears the
 * performance budget and accessibility scores 95+", and every screen worth
 * measuring is behind a sign-in — so an unauthenticated run would score the
 * sign-in page five times and tell nobody anything.
 *
 * This does what `measure-bundles.mjs` does to get in: makes a throwaway user
 * through the local admin API, exchanges a magic link at `/auth/callback`, and
 * hands the resulting session cookie to Lighthouse as an extra header. It also
 * writes a car and a month of expenses first, because an empty ledger is not
 * the page anybody is going to be looking at.
 *
 *   npm run build && npm run lighthouse
 *
 * Needs the local Supabase stack up (`npx supabase start`) and a Chromium.
 * CHROME_PATH is honoured; Brave and Edge both work.
 */

import { execFileSync, spawn } from 'node:child_process'
import { existsSync } from 'node:fs'
import { join } from 'node:path'

import * as chromeLauncher from 'chrome-launcher'
import lighthouse from 'lighthouse'

const PORT = Number(process.env.LIGHTHOUSE_PORT ?? 3988)
const ORIGIN = `http://127.0.0.1:${PORT}`

/** The four categories Lighthouse reports, and what this project asks of them. */
const FLOOR = { performance: 90, accessibility: 95, 'best-practices': 90, seo: 90 }

const CHROME =
  process.env.CHROME_PATH ??
  ['/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
   '/Applications/Brave Browser.app/Contents/MacOS/Brave Browser',
   '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'].find((path) => existsSync(path))

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

function admin({ secretKey }) {
  return {
    apikey: secretKey,
    authorization: `Bearer ${secretKey}`,
    'content-type': 'application/json',
    prefer: 'return=representation',
  }
}

async function signInToken(local) {
  const email = `lighthouse-${Math.random().toString(36).slice(2, 10)}@garage.test`
  const headers = admin(local)

  const created = await fetch(`${local.apiUrl}/auth/v1/admin/users`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ email, email_confirm: true }),
  })
  if (!created.ok) throw new Error(`create user: ${created.status} ${await created.text()}`)
  const { id: userId } = await created.json()

  const link = await fetch(`${local.apiUrl}/auth/v1/admin/generate_link`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ type: 'magiclink', email }),
  })
  if (!link.ok) throw new Error(`generate link: ${link.status} ${await link.text()}`)
  const { hashed_token: hashedToken } = await link.json()

  return { hashedToken, userId }
}

/**
 * A car and forty expenses across three months.
 *
 * Forty rather than four because the ledger virtualises past forty rows and the
 * month figure, the arc and the reports all read differently with a real spread
 * in them. A run against an empty account measures the empty states.
 */
async function seed(local, userId) {
  const headers = admin(local)

  const vehicles = await fetch(`${local.apiUrl}/rest/v1/vehicles`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      user_id: userId,
      nickname: 'Lighthouse probe',
      make: 'Mazda',
      model: 'MX-5',
      year: 2016,
      odometer_km: 48_000,
      purchase_odometer_km: 30_000,
      purchase_date: '2024-02-01',
      purchase_price: 520_000_000,
      currency: 'VND',
    }),
  })
  if (!vehicles.ok) throw new Error(`seed vehicle: ${await vehicles.text()}`)
  const [vehicle] = await vehicles.json()

  const categories = await fetch(
    `${local.apiUrl}/rest/v1/categories?user_id=eq.${userId}&select=id,bucket&limit=6`,
    { headers },
  )
  const cats = categories.ok ? await categories.json() : []

  // The bucket decides the vehicle rather than the other way round: the check
  // constraint on `expenses` will not accept a car bucket without a car, and a
  // seed that depends on which categories happen to exist is a seed that breaks
  // the first time somebody edits the seeded set.
  const BUCKETS = ['life', 'car_running', 'car_project']

  const rows = []
  for (let index = 0; index < 40; index += 1) {
    const month = 6 + (index % 3)
    const day = String((index % 27) + 1).padStart(2, '0')
    const bucket = BUCKETS[index % BUCKETS.length]
    const category = cats.length > 0 ? cats[index % cats.length] : null
    rows.push({
      user_id: userId,
      vehicle_id: bucket === 'life' ? null : vehicle.id,
      category_id: category?.id ?? null,
      occurred_on: `2026-0${month}-${day}`,
      amount: 150_000 + index * 37_000,
      currency: 'VND',
      bucket,
      counts_toward_budget: index % 7 !== 0,
      amortize_months: index % 11 === 0 ? 6 : 1,
      merchant: `Merchant ${index + 1}`,
      is_draft: false,
    })
  }

  const expenses = await fetch(`${local.apiUrl}/rest/v1/expenses`, {
    method: 'POST',
    headers,
    body: JSON.stringify(rows),
  })
  if (!expenses.ok) throw new Error(`seed expenses: ${await expenses.text()}`)

  const budget = await fetch(`${local.apiUrl}/rest/v1/budgets`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      user_id: userId,
      month: '2026-08-01',
      amount: 20_000_000,
      currency: 'VND',
    }),
  })
  if (!budget.ok) throw new Error(`seed budget: ${await budget.text()}`)

  return vehicle.id
}

async function waitForServer() {
  for (let attempt = 0; attempt < 160; attempt += 1) {
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

const cookieHeader = (jar) =>
  Object.entries(jar)
    .map(([name, value]) => `${name}=${value}`)
    .join('; ')

async function main() {
  if (!existsSync(join(process.cwd(), '.next', 'BUILD_ID'))) {
    throw new Error('no production build found — run `npm run build` first')
  }
  if (!CHROME) throw new Error('no Chromium found; set CHROME_PATH')

  const local = stack()
  const { hashedToken, userId } = await signInToken(local)
  const vehicleId = await seed(local, userId)

  const routes = [
    '/today',
    '/ledger',
    `/garage/${vehicleId}`,
    '/money',
    '/money/reports',
    '/settings',
  ]

  const server = spawn('npx', ['next', 'start', '-p', String(PORT)], {
    stdio: ['ignore', 'ignore', 'inherit'],
  })

  let chrome
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

    chrome = await chromeLauncher.launch({
      chromePath: CHROME,
      chromeFlags: ['--headless=new', '--no-sandbox', '--disable-gpu'],
    })

    const results = []
    let failures = 0

    // One warm request per route before it is measured. `next start` compiles a
    // route's server bundle lazily, and the first hit to a cold one pays for
    // that in time-to-first-byte — which is the largest single input to LCP on
    // a throttled link, and not a cost a deployed app pays on every visit.
    for (const route of routes) {
      const warm = await fetch(`${ORIGIN}${route}`, {
        headers: { cookie: cookieHeader(jar) },
        redirect: 'manual',
      })
      if (warm.status !== 200) throw new Error(`${route} answered ${warm.status}`)
      await warm.text()
    }

    for (const route of routes) {
      // Lighthouse's default config is already the mobile one: a Moto G Power
      // emulation on a throttled 4G link, which is the device CLAUDE.md §3
      // writes its budget against.
      const run = await lighthouse(
        `${ORIGIN}${route}`,
        {
          port: chrome.port,
          output: 'json',
          logLevel: 'error',
          extraHeaders: { Cookie: cookieHeader(jar) },
          // A local origin over http has no https to be scored on, and a
          // throwaway probe user has no crawlable site.
          skipAudits: ['is-on-https', 'redirects-http', 'canonical'],
        },
        undefined,
      )

      const lhr = run.lhr
      const scores = Object.fromEntries(
        Object.entries(lhr.categories).map(([key, value]) => [key, Math.round(value.score * 100)]),
      )

      const failed = Object.values(lhr.audits).filter(
        (audit) =>
          audit.score !== null &&
          audit.score < 0.9 &&
          audit.scoreDisplayMode !== 'informative' &&
          audit.scoreDisplayMode !== 'notApplicable',
      )

      results.push({
        route,
        scores,
        metrics: {
          fcp: lhr.audits['first-contentful-paint'].numericValue,
          lcp: lhr.audits['largest-contentful-paint'].numericValue,
          tbt: lhr.audits['total-blocking-time'].numericValue,
          cls: lhr.audits['cumulative-layout-shift'].numericValue,
        },
        failed: failed.map((audit) => `${audit.id}: ${audit.title}`),
      })

      for (const [category, floor] of Object.entries(FLOOR)) {
        if ((scores[category] ?? 0) < floor) failures += 1
      }
    }

    const ms = (value) => `${(value / 1000).toFixed(2)}s`

    console.log('')
    console.log(
      'route'.padEnd(28) +
        'perf  a11y  bp  seo    FCP     LCP     TBT      CLS',
    )
    for (const result of results) {
      console.log(
        result.route.padEnd(28) +
          String(result.scores.performance).padStart(4) +
          String(result.scores.accessibility).padStart(6) +
          String(result.scores['best-practices']).padStart(4) +
          String(result.scores.seo).padStart(5) +
          ms(result.metrics.fcp).padStart(8) +
          ms(result.metrics.lcp).padStart(8) +
          `${Math.round(result.metrics.tbt)}ms`.padStart(8) +
          result.metrics.cls.toFixed(3).padStart(8),
      )
    }

    console.log('')
    for (const result of results) {
      if (result.failed.length === 0) continue
      console.log(`${result.route}`)
      for (const audit of result.failed) console.log(`  ${audit}`)
    }

    if (failures > 0) {
      console.error(`\n${failures} category scores under the floor.`)
      process.exitCode = 1
    } else {
      console.log('\nEvery route clears performance 90, accessibility 95, best practices 90, SEO 90.')
    }
  } finally {
    if (chrome) await chrome.kill()
    server.kill('SIGTERM')
  }
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
