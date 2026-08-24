import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    environment: 'node',
    include: ['{lib,eslint-rules,components}/**/*.test.{ts,mts}'],
    passWithNoTests: true,
  },
})
