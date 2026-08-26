#!/usr/bin/env node
/**
 * Fail the build if the Supabase secret key is reachable from client code.
 *
 * docs/05-OPS.md: "Add a check to CI: fail the build if
 * SUPABASE_SERVICE_ROLE_KEY appears in any file under app/ that isn't marked
 * server-only." This is that check, widened slightly — the rule is about the
 * key, not about a directory, so `components/` and `lib/` are scanned too, and
 * both spellings of the key are matched because Supabase renamed it.
 *
 * Three rules, each of which is a way the key has actually leaked out of a real
 * codebase:
 *
 *   1. It is never `NEXT_PUBLIC_` prefixed. Next inlines those into the browser
 *      bundle by definition; a prefix is a publication, not a configuration.
 *   2. Any file that names it starts with `import 'server-only'`. That package
 *      turns "a Client Component imported this" into a build error rather than a
 *      key in a JavaScript file somebody can view-source.
 *   3. No file that names it is marked `'use client'`.
 *
 * The `server-only` package is the real enforcement and it works transitively;
 * this script is the part that runs in CI and says which line is wrong. Both
 * exist because the failure mode is not recoverable: a key that has been served
 * to one browser has to be rotated, and rotating is a thing you do on a Sunday.
 */

import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'

const ROOT = process.cwd()
const ROOTS = ['app', 'components', 'lib']
const EXTENSIONS = ['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs']
const SKIP_DIRECTORIES = new Set(['node_modules', '.next', '.git'])

/** Both spellings, and the two prefixed forms that must never exist. */
const KEY_PATTERN = /SUPABASE_(?:SECRET_KEY|SERVICE_ROLE_KEY)/
const PUBLIC_PATTERN = /NEXT_PUBLIC_SUPABASE_(?:SECRET_KEY|SERVICE_ROLE_KEY)/
const SERVER_ONLY = /^\s*import\s+['"]server-only['"]/m
const USE_CLIENT = /^\s*['"]use client['"]/m

function walk(directory, files = []) {
  let entries
  try {
    entries = readdirSync(directory)
  } catch {
    return files
  }

  for (const entry of entries) {
    if (SKIP_DIRECTORIES.has(entry)) continue
    const path = join(directory, entry)
    if (statSync(path).isDirectory()) {
      walk(path, files)
    } else if (EXTENSIONS.some((extension) => entry.endsWith(extension))) {
      files.push(path)
    }
  }

  return files
}

const failures = []

for (const root of ROOTS) {
  for (const path of walk(join(ROOT, root))) {
    const source = readFileSync(path, 'utf8')
    if (!KEY_PATTERN.test(source)) continue

    const where = relative(ROOT, path)
    const line = source.split('\n').findIndex((text) => KEY_PATTERN.test(text)) + 1

    if (PUBLIC_PATTERN.test(source)) {
      failures.push(`${where}:${line} names the secret key with a NEXT_PUBLIC_ prefix`)
    }

    if (USE_CLIENT.test(source)) {
      failures.push(`${where}:${line} names the secret key in a "use client" module`)
    }

    if (!SERVER_ONLY.test(source)) {
      failures.push(`${where}:${line} names the secret key without \`import 'server-only'\``)
    }
  }
}

if (failures.length > 0) {
  console.error('The Supabase secret key is reachable from client code:\n')
  for (const failure of failures) console.error(`  ${failure}`)
  console.error(
    "\nThe key bypasses row-level security entirely. Move the read behind a module that starts with `import 'server-only'`.\n" +
      'See docs/05-OPS.md.',
  )
  process.exit(1)
}

console.log('Secret key check passed: the key is named only in server-only modules.')
