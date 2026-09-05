import { fileURLToPath } from 'node:url'

import { defineConfig } from 'vitest/config'

/**
 * The database suites, which are not like the hermetic ones.
 *
 * They share a single Postgres, a single GoTrue and its rate limits — GoTrue
 * allows thirty sign-ups and sign-ins per five minutes, and eleven files
 * creating users at once can spend that. Running them in parallel was never
 * safe; it just usually got away with it. `fileParallelism: false` makes the
 * run deterministic, and costs about fifty seconds.
 *
 * `globalSetup` reads the stack once instead of once per file. See
 * `lib/supabase/test-stack.ts`.
 */
export default defineConfig({
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('.', import.meta.url)).replace(/\/$/, ''),
    },
  },
  test: {
    environment: 'node',
    include: ['{lib,components}/**/*.db.test.ts', 'lib/supabase/local-stack.test.ts'],
    globalSetup: ['./vitest.db.setup.mts'],
    fileParallelism: false,
    testTimeout: 30_000,
    hookTimeout: 120_000,
    passWithNoTests: false,
  },
})
