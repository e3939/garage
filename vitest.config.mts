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
    passWithNoTests: true,
  },
})
