/**
 * How much of a ledger row's text actually fits on a 390pt phone.
 *
 * A ledger row is fixed height and its text truncates rather than wraps, so
 * "does it fit" is a question with a real answer: shape the string with the same
 * font the browser will use, at the same size, and compare the advance width
 * against the space the layout leaves. No browser needed, and no eyeballing.
 *
 * The fonts come out of the production build — the exact subsets next/font
 * generated — and the widths below are read off the layout in
 * components/ledger/ledger-row.tsx and the tokens in app/globals.css.
 *
 *   npm run build && node scripts/measure-ledger-truncation.mjs
 *
 * The eight rows are a fixture, not app data: a representative month of real
 * spend shapes — long Vietnamese merchant names, a mod with a note and a photo,
 * short ones — held here so the before-and-after comparison is like for like.
 */

import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

import { convert } from 'fontverter'
import harfbuzzReady from 'harfbuzzjs'

const CSS_BUNDLE = '.next/static/chunks'
const MEDIA = '.next/static/media'

// --- The layout, in points, at a 390pt viewport ---------------------------
const VIEWPORT = 390
const GUTTER = 16 // --gutter below 600px
const CARD_BORDER = 1 // the ledger card's hairline, both sides
const ROW_PADDING = 16 // px-4
const ROW_GAP = 12 // gap-3
const ICON = 32 // size-8
const GLYPH = 20 // ICON_UI
const GLYPH_GAP = 8 // gap-2 between the detail text and each glyph
const TITLE_SIZE = 16 // --text-body
const DETAIL_SIZE = 12 // --text-caption
const AMOUNT_SIZE = 18 // --text-odometer
const MARKER_SIZE = 12 // --text-caption

/** Everything left for the middle column and the amount column together. */
const MIDDLE_AND_AMOUNT =
  VIEWPORT - 2 * GUTTER - 2 * CARD_BORDER - 2 * ROW_PADDING - ICON - 2 * ROW_GAP

// --- Fonts ----------------------------------------------------------------

async function faceFromWoff2(file) {
  return new Uint8Array(await convert(readFileSync(join(MEDIA, file)), 'truetype'))
}

/** The @font-face rules the build emitted, so the subsets are found by range. */
function fontFaces(family) {
  const css = readFileSync(bundleCss(), 'utf8')
  const faces = []
  for (const rule of css.matchAll(/@font-face\{([^}]*)\}/g)) {
    const body = rule[1]
    if (!body.includes(`font-family:${family};`)) continue
    const src = body.match(/url\(\.\.\/media\/([^)]+)\)/)
    const range = body.match(/unicode-range:([^;]+)/)
    if (src) faces.push({ file: src[1], range: range ? range[1] : '' })
  }
  return faces
}

function bundleCss() {
  const name = readdirSync(CSS_BUNDLE).find((entry) => entry.endsWith('.css'))
  if (!name) throw new Error('no built CSS found — run `npm run build` first')
  return join(CSS_BUNDLE, name)
}

async function harfbuzz() {
  return harfbuzzReady
}

/**
 * A measurer over one or more subsets of the same family: the first subset that
 * has a glyph for a character is the one that gets to measure it, which is what
 * the browser does with `unicode-range` too.
 */
async function measurer(hb, files) {
  if (files.length === 0) throw new Error('no @font-face rules matched that family')
  const faces = await Promise.all(files.map(faceFromWoff2))
  const fonts = faces.map((sfnt) => {
    const blob = hb.createBlob(sfnt)
    const face = hb.createFace(blob, 0)
    const font = hb.createFont(face)
    font.setScale(face.upem, face.upem)
    return { face, font }
  })

  const advance = (font, upem, text, size) => {
    const buffer = hb.createBuffer()
    buffer.addText(text)
    buffer.guessSegmentProperties()
    hb.shape(font, buffer)
    const glyphs = buffer.json()
    buffer.destroy()
    const missing = glyphs.some((glyph) => glyph.g === 0)
    const width = glyphs.reduce((total, glyph) => total + glyph.ax, 0)
    return { missing, width: (width / upem) * size }
  }

  return (text, size) => {
    if (text === '') return 0
    // Whole-string first, so kerning is real; per-character only where a subset
    // turns out not to carry the glyph.
    for (const { face, font } of fonts) {
      const shaped = advance(font, face.upem, text, size)
      if (!shaped.missing) return shaped.width
    }
    let total = 0
    for (const character of text) {
      const hit =
        fonts.find(({ face, font }) => !advance(font, face.upem, character, size).missing) ??
        fonts[0]
      total += advance(hit.font, hit.face.upem, character, size).width
    }
    return total
  }
}

// --- The rows -------------------------------------------------------------

const money = (minor) =>
  new Intl.NumberFormat('vi-VN', {
    style: 'currency',
    currency: 'VND',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  })
    .format(minor)
    .replace(/[  ]/g, ' ')

const BUCKET_LABEL = { life: 'Life', car_running: 'Running', car_project: 'Project' }

const ROWS = [
  {
    merchant: 'Petrolimex Nguyễn Văn Cừ',
    category: 'Fuel',
    vehicle: 'Wave Alpha',
    bucket: 'car_running',
    note: 'full tank, 95',
    photos: 0,
    amount: 92000,
    months: 1,
    counts: true,
  },
  {
    merchant: null,
    category: 'Mods & Parts',
    vehicle: 'Civic',
    bucket: 'car_project',
    note: 'coilovers, second hand from Thanh',
    photos: 2,
    amount: 24000000,
    months: 24,
    counts: false,
  },
  {
    merchant: 'Co.opmart Cống Quỳnh',
    category: 'Groceries',
    vehicle: null,
    bucket: 'life',
    note: 'weekly shop',
    photos: 0,
    amount: 435000,
    months: 1,
    counts: true,
  },
  {
    merchant: 'Bảo hiểm PVI',
    category: 'Insurance',
    vehicle: 'Civic',
    bucket: 'car_running',
    note: null,
    photos: 1,
    amount: 1850000,
    months: 12,
    counts: true,
  },
  {
    merchant: 'Highlands Coffee',
    category: 'Eating out',
    vehicle: null,
    bucket: 'life',
    note: null,
    photos: 0,
    amount: 65000,
    months: 1,
    counts: true,
  },
  {
    merchant: 'Garage Đức Anh',
    category: 'Maintenance',
    vehicle: 'Civic',
    bucket: 'car_running',
    note: 'oil, filter, brake fluid',
    photos: 1,
    amount: 1240000,
    months: 1,
    counts: true,
  },
  {
    merchant: 'Shopee',
    category: 'Home',
    vehicle: null,
    bucket: 'life',
    note: 'water filter cartridge',
    photos: 0,
    amount: 320000,
    months: 1,
    counts: true,
  },
  {
    merchant: null,
    category: 'Parking',
    vehicle: 'Civic',
    bucket: 'car_running',
    note: null,
    photos: 0,
    amount: 15000,
    months: 1,
    counts: true,
  },
]

const title = (row) => row.merchant ?? row.category ?? 'Expense'

/** The detail line as it was: structured fields, then the note, then the count. */
const detailBefore = (row) =>
  [
    BUCKET_LABEL[row.bucket],
    row.merchant ? row.category : null,
    row.vehicle,
    row.note,
    row.photos > 0 ? `${row.photos} photo` : null,
  ]
    .filter(Boolean)
    .join(' · ')

/** And as it is now: structured fields only, the rest carried by glyphs. */
const detailAfter = (row) =>
  [BUCKET_LABEL[row.bucket], row.merchant ? row.category : null, row.vehicle]
    .filter(Boolean)
    .join(' · ')

const marker = (row) =>
  row.months > 1 ? `Over ${row.months} months` : row.counts ? null : 'Kept out'

async function main() {
  const hb = await harfbuzz()
  const body = await measurer(
    hb,
    fontFaces('Inter Tight').map((face) => face.file),
  )
  const mono = await measurer(
    hb,
    // next/font/local names the family after the export in app/fonts.ts.
    fontFaces('jetbrainsMono').map((face) => face.file),
  )

  let before = 0
  let after = 0

  console.log(
    'row                             title   detail(before)   detail(after)   fits'.toUpperCase(),
  )

  for (const row of ROWS) {
    const amountWidth = mono(money(row.amount), AMOUNT_SIZE)
    const markerText = marker(row)
    const markerWidth = markerText ? body(markerText, MARKER_SIZE) : 0
    const rightColumn = Math.max(amountWidth, markerWidth)
    const middle = MIDDLE_AND_AMOUNT - rightColumn

    const glyphs = (row.note ? 1 : 0) + (row.photos > 0 ? 1 : 0)
    const detailRoom = middle - glyphs * (GLYPH + GLYPH_GAP)

    const titleWidth = body(title(row), TITLE_SIZE)
    const beforeWidth = body(detailBefore(row), DETAIL_SIZE)
    const afterWidth = body(detailAfter(row), DETAIL_SIZE)

    // Before, the note lived in the line and there were no glyphs beside it, so
    // the whole middle column was the line's to use.
    const clippedBefore = titleWidth > middle || beforeWidth > middle
    const clippedAfter = titleWidth > middle || afterWidth > detailRoom
    if (clippedBefore) before += 1
    if (clippedAfter) after += 1

    console.log(
      `${title(row).slice(0, 28).padEnd(30)}` +
        `${titleWidth.toFixed(0).padStart(4)}/${middle.toFixed(0)}` +
        `${beforeWidth.toFixed(0).padStart(8)}/${middle.toFixed(0)}` +
        `${afterWidth.toFixed(0).padStart(12)}/${detailRoom.toFixed(0)}` +
        `   ${clippedBefore ? 'clipped' : 'fits'} -> ${clippedAfter ? 'clipped' : 'fits'}`,
    )
  }

  console.log('')
  console.log(`Rows clipping any line, of ${ROWS.length}: ${before} before, ${after} after.`)
}

await main()
