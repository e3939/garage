import { fileURLToPath } from 'node:url'

import { defineConfig } from 'vitest/config'

export default defineConfig({
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('.', import.meta.url)).replace(/\/$/, ''),
    },
  },
  test: {
    environment: 'node',
    include: ['{lib,eslint-rules,components}/**/*.test.{ts,mts}'],
    // The database suites have their own config: they share one Postgres and
    // one GoTrue, so they run serially. See vitest.db.config.mts.
    exclude: ['**/node_modules/**', '**/*.db.test.ts', 'lib/supabase/local-stack.test.ts'],
    passWithNoTests: true,
  },
})
