import { Archivo, Inter_Tight } from 'next/font/google'
import localFont from 'next/font/local'

/**
 * Three faces, self-hosted, exposed as CSS variables that app/globals.css maps
 * onto --font-display / --font-body / --font-mono. See docs/03-DESIGN.md.
 */

/** Display — Archivo carrying its width axis so it can be set Expanded. */
export const archivo = Archivo({
  subsets: ['latin', 'latin-ext', 'vietnamese'],
  axes: ['wdth'],
  display: 'swap',
  variable: '--font-archivo',
})

/** Body — every piece of UI text. */
export const interTight = Inter_Tight({
  subsets: ['latin', 'latin-ext', 'vietnamese'],
  display: 'swap',
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

export const fontVariables = [
  archivo.variable,
  interTight.variable,
  jetbrainsMono.variable,
].join(' ')
