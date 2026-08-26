/**
 * The acceptance criterion for roadmap Phase 9, run rather than asserted:
 *
 *   "You can leave the app with all your data and come back with it intact."
 *
 * So this leaves, and comes back.
 *
 *   1. Seeds a user with a car and a ledger full of the things that usually
 *      break a CSV: a comma, a quote, a line break, a Vietnamese merchant name,
 *      a refund, a spread expense, an odometer reading.
 *   2. Signs in against a real production server exactly as a browser does, and
 *      downloads `expenses.csv`, `garage.json` and the attachment manifest from
 *      the export endpoint.
 *   3. Feeds that CSV back through the same decoder, parser, auto-mapper and
 *      planner the import screen uses — the app's own modules, imported, not a
 *      reimplementation — and commits it through `import_expenses` to a
 *      **second, empty user**.
 *   4. Exports *that* user and compares the two files row by row.
 *   5. Imports the same file a second time and checks that nothing happens.
 *
 * Step four is the part worth having. An export that reads back into an empty
 * account is the only proof that the file is a file and not a memento: it has to
 * carry the category and the vehicle by name, the amount in a form that survives
 * a locale, and the date in a form that is not ambiguous.
 *
 *   npm run build && npm run verify:round-trip
 */

import { execFileSync, spawn } from 'node:child_process'
import { existsSync } from 'node:fs'
import { register } from 'node:module'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'

const PORT = 3123
const ORIGIN = `http://127.0.0.1:${PORT}`

function stack() {
  const raw = execFileSync('npx', ['supabase', 'status', '-o', 'json'], {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'ignore'],
  })
  const status = JSON.parse(raw.slice(raw.indexOf('{')))
  return {
    apiUrl: status.API_URL ?? 'http://127.0.0.1:54321',
    publishableKey: status.PUBLISHABLE_KEY ?? status.ANON_KEY,
    secretKey: status.SECRET_KEY ?? status.SERVICE_ROLE_KEY,
  }
}

function adminHeaders({ secretKey }) {
  return {
    apikey: secretKey,
    authorization: `Bearer ${secretKey}`,
    'content-type': 'application/json',
    prefer: 'return=representation',
  }
}

/**
 * A confirmed user with a password as well as a magic link. The link is how the
 * app signs it in; the password is how this script gets a REST token to call the
 * import function as that user, which is the only way `auth.uid()` is right.
 */
async function createUser(local, prefix) {
  const email = `${prefix}-${Math.random().toString(36).slice(2, 10)}@garage.test`
  const password = `probe-${Math.random().toString(36).slice(2, 12)}`

  const created = await fetch(`${local.apiUrl}/auth/v1/admin/users`, {
    method: 'POST',
    headers: adminHeaders(local),
    body: JSON.stringify({ email, password, email_confirm: true }),
  })
  if (!created.ok) throw new Error(`create user: ${await created.text()}`)
  const { id } = await created.json()

  const link = await fetch(`${local.apiUrl}/auth/v1/admin/generate_link`, {
    method: 'POST',
    headers: adminHeaders(local),
    body: JSON.stringify({ type: 'magiclink', email }),
  })
  if (!link.ok) throw new Error(`generate link: ${await link.text()}`)
  const { hashed_token: hashedToken } = await link.json()

  const signedIn = await fetch(`${local.apiUrl}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: { apikey: local.publishableKey, 'content-type': 'application/json' },
    body: JSON.stringify({ email, password }),
  })
  if (!signedIn.ok) throw new Error(`sign in: ${await signedIn.text()}`)
  const { access_token: token } = await signedIn.json()

  return { id, email, hashedToken, token }
}

async function admin(local, path, init = {}) {
  const response = await fetch(`${local.apiUrl}/rest/v1/${path}`, {
    ...init,
    headers: { ...adminHeaders(local), ...(init.headers ?? {}) },
  })
  const text = await response.text()
  if (!response.ok) throw new Error(`${path}: ${response.status} ${text}`)
  return text === '' ? [] : JSON.parse(text)
}

/** The import function, called as a user, exactly as the server action calls it. */
async function importExpenses(local, user, categories, expenses) {
  const response = await fetch(`${local.apiUrl}/rest/v1/rpc/import_expenses`, {
    method: 'POST',
    headers: {
      apikey: local.publishableKey,
      authorization: `Bearer ${user.token}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify({ p_categories: categories, p_expenses: expenses }),
  })
  const text = await response.text()
  if (!response.ok) throw new Error(`import_expenses: ${response.status} ${text}`)
  return JSON.parse(text)
}

const VEHICLE_NAME = 'Con Cào Cào'

/** A ledger with everything in it that usually breaks a CSV. */
async function seed(local, userId) {
  await admin(local, 'vehicles', {
    method: 'POST',
    body: JSON.stringify({
      user_id: userId,
      nickname: VEHICLE_NAME,
      make: 'Honda',
      model: 'Civic',
      year: 2019,
      purchase_date: '2024-02-01',
      purchase_price: 720_000_000,
      currency: 'VND',
      odometer_km: 41_250,
      purchase_odometer_km: 34_500,
    }),
  })

  const [vehicle] = await admin(
    local,
    `vehicles?user_id=eq.${userId}&select=id,nickname`,
  )
  const categories = await admin(local, `categories?user_id=eq.${userId}&select=id,name`)
  const byName = Object.fromEntries(categories.map((row) => [row.name, row.id]))

  const rows = [
    {
      occurred_on: '2026-08-01',
      amount: 640_000,
      bucket: 'car_running',
      counts_toward_budget: true,
      category_id: byName.Fuel,
      vehicle_id: vehicle.id,
      merchant: 'Petrolimex, Nguyễn Trãi',
      note: 'Đổ đầy bình',
      odometer_km: 41_000,
      amortize_months: 1,
    },
    {
      occurred_on: '2026-08-04',
      amount: 4_200_000,
      bucket: 'car_project',
      counts_toward_budget: false,
      category_id: byName['Mods & Parts'],
      vehicle_id: vehicle.id,
      merchant: 'Shop "Bảy" Coilover',
      note: 'Two lines\nof note, with a comma',
      odometer_km: null,
      amortize_months: 6,
    },
    {
      occurred_on: '2026-08-06',
      amount: -1_500_000,
      bucket: 'car_project',
      counts_toward_budget: false,
      category_id: byName['Mods & Parts'],
      vehicle_id: vehicle.id,
      merchant: 'Sold the old springs',
      note: null,
      odometer_km: null,
      amortize_months: 1,
    },
    {
      occurred_on: '2026-08-09',
      amount: 85_000,
      bucket: 'life',
      counts_toward_budget: true,
      category_id: byName['Eating out'],
      vehicle_id: null,
      merchant: 'Bún chả',
      note: null,
      odometer_km: null,
      amortize_months: 1,
    },
    {
      occurred_on: '2026-08-12',
      amount: 12_000_000,
      bucket: 'life',
      counts_toward_budget: true,
      category_id: byName.Housing,
      vehicle_id: null,
      merchant: null,
      note: 'Rent; quarterly',
      odometer_km: null,
      amortize_months: 3,
    },
  ].map((row) => ({ ...row, user_id: userId, currency: 'VND' }))

  await admin(local, 'expenses', { method: 'POST', body: JSON.stringify(rows) })
  return rows.length
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

/** Sign in the way the app does: the magic-link callback, keeping its cookies. */
async function signIn(hashedToken) {
  const jar = {}
  const callback = await fetch(
    `${ORIGIN}/auth/callback?token_hash=${hashedToken}&type=magiclink`,
    { redirect: 'manual' },
  )
  absorb(jar, callback)
  const landing = callback.headers.get('location') ?? ''
  if (landing.includes('/sign-in')) throw new Error(`sign-in failed: ${landing}`)
  return jar
}

async function download(jar, artifact) {
  const response = await fetch(`${ORIGIN}/api/export/${artifact}`, {
    headers: { cookie: cookieHeader(jar) },
    redirect: 'manual',
  })
  if (response.status !== 200) {
    throw new Error(`/api/export/${artifact} answered ${response.status}`)
  }
  return { bytes: new Uint8Array(await response.arrayBuffer()), headers: response.headers }
}

/** The columns two ledgers have to agree on for the round trip to have worked. */
const COMPARED = [
  'occurred_on',
  'amount',
  'currency',
  'category',
  'vehicle',
  'bucket',
  'counts_toward_budget',
  'amortize_months',
  'merchant',
  'note',
  'odometer_km',
]

/** One exported row, reduced to the columns that have to survive the trip. */
function compare(table) {
  const index = Object.fromEntries(table.header.map((name, position) => [name, position]))
  return table.rows
    .map((row) => JSON.stringify(COMPARED.map((column) => row[index[column]] ?? '')))
    .sort()
}

const check = (label, condition, detail = '') => {
  console.log(`${condition ? '  ok  ' : ' FAIL '}${label}${detail ? ` — ${detail}` : ''}`)
  if (!condition) process.exitCode = 1
}

async function main() {
  if (!existsSync(join(process.cwd(), '.next', 'BUILD_ID'))) {
    throw new Error('no production build found — run `npm run build` first')
  }

  // The app's own modules, through the same path alias the app uses. Verifying a
  // copy of the parser would verify nothing.
  register('./scripts/ts-alias-loader.mjs', pathToFileURL('./'))
  const { decodeCsv } = await import('@/lib/csv/decode')
  const { parseCsv } = await import('@/lib/csv/parse')
  const { autoMap } = await import('@/lib/import/fields')
  const { planImport, readyExpenses } = await import('@/lib/import/rows')

  const local = stack()
  const leaver = await createUser(local, 'roundtrip-out')
  const arriver = await createUser(local, 'roundtrip-in')
  const seeded = await seed(local, leaver.id)

  // The arriving user needs the same car for the car rows to attach to. An
  // import never creates a vehicle — see `lib/import/fields.ts`.
  await admin(local, 'vehicles', {
    method: 'POST',
    body: JSON.stringify({
      user_id: arriver.id,
      nickname: VEHICLE_NAME,
      odometer_km: 34_500,
      purchase_odometer_km: 34_500,
    }),
  })

  const server = spawn('npx', ['next', 'start', '-p', String(PORT)], {
    stdio: ['ignore', 'ignore', 'inherit'],
  })

  try {
    await waitForServer()

    // ---- Leaving -------------------------------------------------------
    const outJar = await signIn(leaver.hashedToken)

    const csv = await download(outJar, 'expenses.csv')
    const json = await download(outJar, 'garage.json')
    const manifest = await download(outJar, 'attachments-manifest.csv')

    check(
      'expenses.csv arrives as a download',
      (csv.headers.get('content-disposition') ?? '').startsWith('attachment;'),
      csv.headers.get('content-disposition') ?? '',
    )
    check(
      'expenses.csv carries a UTF-8 byte-order mark',
      csv.bytes[0] === 0xef && csv.bytes[1] === 0xbb && csv.bytes[2] === 0xbf,
    )
    check('the manifest is a file too', manifest.bytes.length > 0)

    const bundle = JSON.parse(new TextDecoder().decode(json.bytes))
    check(
      'garage.json holds every table',
      Object.keys(bundle.data).length === 17,
      `${Object.keys(bundle.data).length} tables`,
    )
    check('garage.json holds the ledger', bundle.data.expenses.length === seeded)
    check(
      'garage.json says when its attachment URLs die',
      typeof bundle.garage.attachment_urls_expire_at === 'string',
    )

    // ---- Reading it back -----------------------------------------------
    const decoded = decodeCsv(csv.bytes)
    check('the export reads back as UTF-8', decoded.encoding === 'utf-8-bom', decoded.encoding)

    const outTable = parseCsv(decoded.text)
    check('every row survived the file', outTable.rows.length === seeded, `${outTable.rows.length} rows`)

    const mapping = autoMap(outTable.header)
    check(
      'the export maps itself with nothing to do',
      ['id', 'occurred_on', 'amount', 'category', 'vehicle', 'bucket', 'note'].every(
        (key) => mapping[key] !== undefined,
      ),
      Object.keys(mapping).join(', '),
    )

    const categories = await admin(
      local,
      `categories?user_id=eq.${arriver.id}&select=id,name,default_bucket,default_counts_toward_budget`,
    )
    const vehicles = await admin(local, `vehicles?user_id=eq.${arriver.id}&select=id,nickname`)

    const plan = planImport(outTable, mapping, { categories, vehicles, currency: 'VND' })

    check(
      'the dry run says every row will import',
      plan.ready === seeded && plan.skipped === 0,
      `${plan.ready} ready, ${plan.skipped} skipped${
        plan.reasons.length ? `: ${plan.reasons.map((r) => `${r.reason} x${r.count}`).join(', ')}` : ''
      }`,
    )
    check('and that no category has to be invented', plan.newCategories.length === 0)

    // ---- Coming back ---------------------------------------------------
    const committed = await importExpenses(local, arriver, plan.newCategories, readyExpenses(plan))
    check(
      'the commit imported every ready row',
      committed.expenses_imported === plan.ready,
      JSON.stringify(committed),
    )

    const again = await importExpenses(local, arriver, plan.newCategories, readyExpenses(plan))
    check(
      'importing the same file twice changes nothing',
      again.expenses_imported === 0 && again.expenses_skipped === plan.ready,
      JSON.stringify(again),
    )

    // ---- Comparing the two ledgers -------------------------------------
    const inJar = await signIn(arriver.hashedToken)
    const theirCsv = await download(inJar, 'expenses.csv')
    const inTable = parseCsv(decodeCsv(theirCsv.bytes).text)

    const before = compare(outTable)
    const after = compare(inTable)

    check('the second ledger is the same length', before.length === after.length, `${after.length}`)

    for (let index = 0; index < before.length; index += 1) {
      const same = before[index] === after[index]
      check(
        `row ${index + 1} came back identical`,
        same,
        same ? '' : `\n    out: ${before[index]}\n    in:  ${after[index]}`,
      )
    }

    console.log('')
    console.log(
      process.exitCode === 1
        ? 'Round trip failed. That file is not one you could come back with.'
        : `Round trip clean: ${before.length} expenses left as CSV, came back into an empty account identical, and ${VEHICLE_NAME} kept its name through the encoding.`,
    )
  } finally {
    server.kill('SIGTERM')
  }
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
