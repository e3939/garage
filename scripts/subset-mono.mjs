/**
 * Cuts JetBrains Mono down to the characters the app actually sets in it:
 * digits, punctuation and currency signs. docs/03-DESIGN.md reserves the mono
 * face for numbers, so letterforms are dead weight in the route payload.
 *
 * Run with `npm run fonts`. The output is committed — it is a build input for
 * next/font/local, not a build artefact.
 *
 * ### Why there are two output files
 *
 * Fontsource ships this family already split the way Google Fonts splits it,
 * into disjoint files by unicode range. Digits live in `latin`. The dong sign
 * U+20AB does not: it is in `latin-ext` and `vietnamese`, and no single source
 * file holds both.
 *
 * The range list below has asked for U+20AB since Phase 0 and has never got it,
 * because you cannot subset in a glyph the source does not have — the request
 * is silently dropped. The result was every amount in the app rendering its
 * currency mark in the fallback face, at the fallback's width, which is exactly
 * as obvious as it sounds once you look for it.
 *
 * So: digits and punctuation are cut from `latin`, the currency marks that are
 * not in it are cut from `vietnamese`, and both are declared in `app/fonts.ts`
 * as one font stack. CSS falls back per character, so a number takes its digits
 * from the first file and its dong sign from the second.
 */
import { readFile, writeFile, mkdir } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import subsetFont from 'subset-font'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')

const file = (subset) =>
  resolve(
    root,
    `node_modules/@fontsource-variable/jetbrains-mono/files/jetbrains-mono-${subset}-wght-normal.woff2`,
  )

const DIGITS_SOURCE = file('latin')
const DIGITS_OUTPUT = resolve(root, 'app/fonts/jetbrains-mono-digits.woff2')

const SYMBOL_SOURCE = file('vietnamese')
const SYMBOL_OUTPUT = resolve(root, 'app/fonts/jetbrains-mono-symbols.woff2')

const ranges = [
  [0x0020, 0x002f], // space and ASCII punctuation up to /
  [0x0030, 0x0039], // digits
  [0x003a, 0x0040], // : ; < = > ? @
  [0x005b, 0x0060], // [ \ ] ^ _ `
  [0x007b, 0x007e], // { | } ~
  [0x00a2, 0x00a5], // cent, pound, currency, yen
  [0x00b0, 0x00b1], // degree, plus-minus
  [0x00d7, 0x00d7], // multiplication sign
  [0x2013, 0x2014], // en dash, em dash
  [0x2018, 0x201d], // curly quotes
  [0x2022, 0x2022], // bullet
  [0x2026, 0x2026], // ellipsis
  [0x2030, 0x2030], // per mille
  [0x2192, 0x2192], // rightwards arrow
]

/**
 * The marks the `latin` file does not carry. Kept deliberately small: this file
 * is fetched alongside the digits on every screen that shows money.
 */
const symbolRanges = [
  [0x0111, 0x0111], // d with stroke, the letter the dong sign is built from
  [0x20ab, 0x20ab], // dong sign
]

const expand = (list) =>
  list
    .flatMap(([start, end]) => {
      const out = []
      for (let code = start; code <= end; code += 1) out.push(String.fromCodePoint(code))
      return out
    })
    .join('')

const kb = (bytes) => `${(bytes / 1024).toFixed(1)}KB`

/**
 * Subsetting silently drops a character the source does not have, which is how
 * the dong sign went missing for three phases without a single error. So every
 * character asked for is verified present in the output, and the build fails
 * loudly if one is not.
 */
async function cut(sourcePath, outputPath, characters, required) {
  const source = await readFile(sourcePath)
  const subset = await subsetFont(source, characters, { targetFormat: 'woff2' })

  for (const character of required) {
    const without = await subsetFont(source, characters.replace(character, ''), {
      targetFormat: 'woff2',
    })
    if (subset.length === without.length) {
      throw new Error(
        `${outputPath}: U+${character.codePointAt(0).toString(16).toUpperCase().padStart(4, '0')} ` +
          `is not in ${sourcePath}. Subsetting cannot add a glyph that is not there.`,
      )
    }
  }

  await mkdir(dirname(outputPath), { recursive: true })
  await writeFile(outputPath, subset)

  process.stdout.write(
    `${outputPath.split('/').pop().padEnd(30)} ${kb(source.length)} -> ${kb(subset.length)}  ` +
      `(${characters.length} characters)\n`,
  )
}

await cut(DIGITS_SOURCE, DIGITS_OUTPUT, expand(ranges), '0123456789')
await cut(SYMBOL_SOURCE, SYMBOL_OUTPUT, expand(symbolRanges), '\u20ab')
