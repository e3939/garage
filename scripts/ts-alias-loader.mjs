/**
 * A module resolver for scripts that want to run the app's own code.
 *
 * Node 24 strips TypeScript types on its own, so the only two things missing are
 * the `@/` path alias from `tsconfig.json` and the extensionless imports the app
 * writes. Both are resolution, not compilation, so a resolve hook is the whole
 * of it — no bundler, no second copy of the module, and no chance of a script
 * verifying a reimplementation of the thing it was meant to be verifying.
 *
 * Used by `scripts/verify-round-trip.mjs`.
 */

import { existsSync } from 'node:fs'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { join } from 'node:path'

const ROOT = process.cwd()

/** `@/lib/money` -> `<root>/lib/money.ts`, if that file is really there. */
function withExtension(path) {
  if (existsSync(path)) return path
  for (const extension of ['.ts', '.tsx', '.mjs', '.js']) {
    if (existsSync(path + extension)) return path + extension
  }
  for (const index of ['index.ts', 'index.tsx']) {
    if (existsSync(join(path, index))) return join(path, index)
  }
  return path
}

export function resolve(specifier, context, next) {
  if (specifier.startsWith('@/')) {
    const target = withExtension(join(ROOT, specifier.slice(2)))
    return next(pathToFileURL(target).href, context)
  }

  // A relative import inside an aliased module has the same problem.
  if ((specifier.startsWith('./') || specifier.startsWith('../')) && context.parentURL) {
    const parent = fileURLToPath(context.parentURL)
    const target = withExtension(join(parent, '..', specifier))
    if (target.endsWith('.ts') || target.endsWith('.tsx')) {
      return next(pathToFileURL(target).href, context)
    }
  }

  return next(specifier, context)
}
