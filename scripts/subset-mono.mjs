/**
 * Cuts JetBrains Mono down to the characters the app actually sets in it:
 * digits, punctuation and currency signs. docs/03-DESIGN.md reserves the mono
 * face for numbers, so letterforms are dead weight in the route payload.
 *
 * Run with `npm run fonts`. The output is committed — it is a build input for
 * next/font/local, not a build artefact.
 */
import { readFile, writeFile, mkdir } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import subsetFont from 'subset-font'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')

const SOURCE = resolve(
  root,
  'node_modules/@fontsource-variable/jetbrains-mono/files/jetbrains-mono-latin-wght-normal.woff2',
)
const OUTPUT = resolve(root, 'app/fonts/jetbrains-mono-digits.woff2')

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
  [0x20a1, 0x20bf], // currency block, includes the dong sign U+20AB
]

const characters = ranges
  .flatMap(([start, end]) => {
    const out = []
    for (let code = start; code <= end; code += 1) out.push(String.fromCodePoint(code))
    return out
  })
  .join('')

const source = await readFile(SOURCE)
const subset = await subsetFont(source, characters, { targetFormat: 'woff2' })

await mkdir(dirname(OUTPUT), { recursive: true })
await writeFile(OUTPUT, subset)

const kb = (bytes) => `${(bytes / 1024).toFixed(1)}KB`
process.stdout.write(
  `jetbrains-mono-digits.woff2  ${kb(source.length)} -> ${kb(subset.length)}  ` +
    `(${characters.length} characters)\n`,
)
