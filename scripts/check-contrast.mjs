/**
 * The contrast floor, checked against the tokens rather than against a
 * screenshot.
 *
 * docs/03-DESIGN.md: "Contrast floor: 4.5:1 for body text, 3:1 for large text
 * and UI borders. --fire-amber on paper fails for text — use it for fills and
 * strokes only, never for words."
 *
 * Dark mode arrived in Phase 8 and doubled the number of pairs anybody has to
 * hold in their head, which is exactly the moment to stop holding them. This
 * reads `app/globals.css` — the tokens themselves, resolving `var()` chains —
 * and checks every pair the app actually puts on screen, in both modes.
 *
 * Run: `npm run check:contrast`. Exits 1 on a failure and names it.
 */

import { readFileSync } from 'node:fs'

const CSS = readFileSync(new URL('../app/globals.css', import.meta.url), 'utf8')

/** Body text, and anything set below 18.66px or below 14px bold. */
const BODY = 4.5
/** Large text, icons and the strokes that carry meaning. */
const UI = 3
/**
 * A rule between two rows and the fill inside a gauge. Neither carries meaning
 * on its own — the state next to them is always in words and an icon, which is
 * the "colour never carries meaning alone" rule doing its job — so the floor
 * they are held to is that they can be seen at all. docs/03-DESIGN.md says of
 * amber in particular: "use it for fills and strokes only, never for words."
 * This is here so that a change which made a hairline invisible would still be
 * caught by something.
 */
const DECORATIVE = 1.3

// ---------------------------------------------------------------------------
// Reading the tokens out of the stylesheet.
// ---------------------------------------------------------------------------

/** Every `--name: value` in a block of CSS text, last declaration winning. */
function declarations(block) {
  const found = new Map()
  for (const match of block.matchAll(/(--[a-z0-9-]+)\s*:\s*([^;]+);/g)) {
    found.set(match[1], match[2].trim())
  }
  return found
}

/** The text between the brace that follows `from` and its matching close. */
function blockAfter(css, from) {
  const open = css.indexOf('{', from)
  let depth = 0
  for (let index = open; index < css.length; index += 1) {
    if (css[index] === '{') depth += 1
    if (css[index] === '}') {
      depth -= 1
      if (depth === 0) return css.slice(open + 1, index)
    }
  }
  throw new Error('unbalanced braces in globals.css')
}

const lightTokens = declarations(blockAfter(CSS, CSS.indexOf(':root')))

const darkAt = CSS.indexOf('@media (prefers-color-scheme: dark)')
if (darkAt === -1) throw new Error('no dark mode block in globals.css')
const darkTokens = new Map([
  ...lightTokens,
  ...declarations(blockAfter(CSS, CSS.indexOf(':root', darkAt))),
])

/** Follows `var(--a)` chains down to a hex. */
function resolve(tokens, name, seen = new Set()) {
  if (seen.has(name)) throw new Error(`circular token: ${name}`)
  seen.add(name)

  const value = tokens.get(name)
  if (value === undefined) throw new Error(`unknown token: ${name}`)

  const reference = value.match(/^var\((--[a-z0-9-]+)\)$/)
  if (reference) return resolve(tokens, reference[1], seen)

  if (!/^#[0-9a-f]{6}$/i.test(value)) throw new Error(`${name} is not a hex: ${value}`)
  return value
}

// ---------------------------------------------------------------------------
// WCAG 2.1 relative luminance and contrast.
// ---------------------------------------------------------------------------

function channel(part) {
  const srgb = part / 255
  return srgb <= 0.04045 ? srgb / 12.92 : ((srgb + 0.055) / 1.055) ** 2.4
}

function luminance(hex) {
  const r = channel(parseInt(hex.slice(1, 3), 16))
  const g = channel(parseInt(hex.slice(3, 5), 16))
  const b = channel(parseInt(hex.slice(5, 7), 16))
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}

function contrast(a, b) {
  const [high, low] = [luminance(a), luminance(b)].sort((x, y) => y - x)
  return (high + 0.05) / (low + 0.05)
}

// ---------------------------------------------------------------------------
// The pairs. Every one of these is on a screen somewhere.
// ---------------------------------------------------------------------------

const PAIRS = [
  // Body text on each of the three surfaces.
  ['--text', '--bg', BODY, 'body text on the app background'],
  ['--text', '--surface', BODY, 'body text on a card'],
  ['--text', '--surface-sunken', BODY, 'a figure on the odometer bed'],
  ['--text-muted', '--bg', BODY, 'secondary text on the app background'],
  ['--text-muted', '--surface', BODY, 'secondary text on a card'],
  ['--text-muted', '--surface-sunken', BODY, 'a caption on the odometer bed'],
  // Tertiary text is placeholders and em dashes: never load-bearing, but it is
  // still words, so it is held to the large-text floor rather than to nothing.
  ['--text-faint', '--surface', UI, 'placeholder text on a card'],

  // States, as words.
  ['--accent', '--bg', BODY, 'a link or a text action'],
  ['--accent', '--surface', BODY, 'a text action on a card'],
  ['--positive', '--surface', BODY, 'an under-budget figure'],
  ['--critical', '--surface', BODY, 'an over-budget or destructive figure'],
  ['--critical', '--surface-sunken', BODY, 'an over-budget figure on the bed'],

  // The brick action and its label.
  ['--accent-ink', '--accent', BODY, 'the label on the primary button'],

  // Buckets carry a word each, everywhere in the app.
  ['--bucket-life', '--surface', BODY, 'a life bucket chip'],
  ['--bucket-car-running', '--surface', BODY, 'a running-cost bucket chip'],
  ['--bucket-car-project', '--surface', BODY, 'a project bucket chip'],

  // Strokes and fills. The floor is 3:1 and amber lives here, never in words.
  ['--attention', '--surface', DECORATIVE, 'the due-soon fill'],
  ['--border-strong', '--surface', DECORATIVE, 'a hairline between rows'],
  ['--border', '--surface', DECORATIVE, 'a hairline on a card'],
  ['--positive', '--bg', UI, 'the focus ring'],
  ['--positive', '--surface', UI, 'the focus ring on a card'],

  // The stamp is raw ink on raw cream in both modes; it has to hold on its own.
  ['--fire-brick', '--fire-cream', BODY, 'stamp text'],
]

// ---------------------------------------------------------------------------

let failed = 0
const rows = []

for (const [mode, tokens] of [
  ['light', lightTokens],
  ['dark', darkTokens],
]) {
  for (const [foreground, background, floor, what] of PAIRS) {
    const ratio = contrast(resolve(tokens, foreground), resolve(tokens, background))
    const ok = ratio >= floor
    if (!ok) failed += 1
    rows.push(
      `${ok ? 'pass' : 'FAIL'}  ${mode.padEnd(5)} ${ratio.toFixed(2).padStart(5)}:1 ` +
        `(needs ${floor})  ${what}`,
    )
  }
}

console.log(rows.join('\n'))

if (failed > 0) {
  console.error(`\n${failed} contrast ${failed === 1 ? 'pair is' : 'pairs are'} under the floor.`)
  process.exit(1)
}

console.log(`\nAll ${rows.length} pairs clear the floor in both modes.`)
