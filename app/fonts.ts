import { Archivo, Inter_Tight } from 'next/font/google'
import localFont from 'next/font/local'

/**
 * Three faces, self-hosted, exposed as CSS variables that app/globals.css maps
 * onto --font-display / --font-body / --font-mono. See docs/03-DESIGN.md.
 *
 * ### Why the two Google families are not preloaded
 *
 * `next/font/google` preloads every subset it generates, which for two variable
 * families across latin, latin-ext and vietnamese is six files and 357KB — all
 * of it at the highest priority, on a link the rest of the page is also trying
 * to use. A Lighthouse mobile run put Largest Contentful Paint at 3.9s with
 * them preloaded and 2.7s without, because `unicode-range` means a browser
 * showing English text fetches the latin subset and nothing else: three files
 * and 162KB, and the two subsets a Vietnamese screen needs arrive when there is
 * Vietnamese on the screen.
 *
 * The cost is a slightly later swap from the fallback face, which is why
 * `adjustFontFallback` is left on — Next sizes the fallback to the real face so
 * the swap does not move the layout. Measured cumulative layout shift is 0.001.
 *
 * JetBrains Mono keeps its preload. It is 27KB, it is subset to digits, and it
 * is the face every hero figure in the app is set in — the one place where a
 * swap would be seen.
 */

/** Display — Archivo carrying its width axis so it can be set Expanded. */
export const archivo = Archivo({
  subsets: ['latin', 'latin-ext', 'vietnamese'],
  axes: ['wdth'],
  display: 'swap',
  preload: false,
  variable: '--font-archivo',
})

/** Body — every piece of UI text. */
export const interTight = Inter_Tight({
  subsets: ['latin', 'latin-ext', 'vietnamese'],
  display: 'swap',
  preload: false,
  variable: '--font-inter-tight',
})

/**
 * Data — subset to digits, punctuation and currency signs only, because it is
 * never used for words. Regenerate with `npm run fonts` if the set changes.
 */
export const jetbrainsMono = localFont({
  src: './fonts/jetbrains-mono-digits.woff2',
  weight: '100 800',
  style: 'normal',
  display: 'swap',
  variable: '--font-jetbrains-mono',
  // Nothing outside the subset should silently fall back to a proportional
  // face mid-number, so the fallback is a monospace stack.
  fallback: ['ui-monospace', 'SFMono-Regular', 'Menlo', 'monospace'],
})

/**
 * Data, continued — the dong sign and the letter it is built from.
 *
 * Fontsource splits this family by unicode range the way Google Fonts does, and
 * U+20AB is not in the `latin` file the digits come from. It cannot be subset in
 * from there, so it is a second face cut from `vietnamese`, and the two are
 * stacked in `--font-mono`. CSS resolves a font stack per character, so a VND
 * amount takes its digits from one file and its `₫` from the other.
 *
 * This face goes FIRST in that stack, and carries neither a `fallback` list nor
 * an adjusted fallback. Both of those would be emitted as extra families
 * between the two real ones — and a system monospace does have a dong sign, so
 * it would answer for `₫` and the second file would never be reached. Ordering
 * it first, bare, means the only character it can claim is one it actually has;
 * everything else falls straight through to the digits face, which keeps its
 * size-adjusted fallback because that is where a swap would be seen.
 *
 * 1.3KB, on screen wherever money is.
 */
export const jetbrainsMonoSymbols = localFont({
  src: './fonts/jetbrains-mono-symbols.woff2',
  weight: '100 800',
  style: 'normal',
  display: 'swap',
  variable: '--font-jetbrains-mono-symbols',
  adjustFontFallback: false,
})

export const fontVariables = [
  archivo.variable,
  interTight.variable,
  jetbrainsMono.variable,
  jetbrainsMonoSymbols.variable,
].join(' ')
