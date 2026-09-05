import { execFileSync } from 'node:child_process'

/**
 * Where the local Supabase stack is, for the database test suites.
 *
 * There used to be a copy of this in each of the eleven `*.db.test.ts` files,
 * and each copy shelled out to `npx supabase status`. Eleven CLI spawns racing
 * each other is most of why the suite was flaky: under load the spawns took ten
 * seconds apiece, and a whole file could come back reporting its tests skipped
 * rather than run — a suite that goes green while proving nothing, which is
 * worse than one that fails.
 *
 * So the values are read once by `vitest.db.setup.mts` before any worker
 * starts, handed on through the environment, and this only falls back to the
 * CLI when a file is run on its own.
 */

export type Stack = { apiUrl: string; publishableKey: string; secretKey: string }

/** Set by the global setup so the workers never spawn the CLI themselves. */
const ENV_KEYS = {
  apiUrl: 'GARAGE_STACK_API_URL',
  publishableKey: 'GARAGE_STACK_PUBLISHABLE_KEY',
  secretKey: 'GARAGE_STACK_SECRET_KEY',
} as const

/** Whether the database suites should run at all. Set by `npm run test:db`. */
export const DB_TESTS_ENABLED = process.env.GARAGE_DB_TESTS === '1'

/** Reads the stack straight from the CLI. Slow; used once, or for a lone file. */
export function readStackFromCli(): Stack {
  const raw = execFileSync('npx', ['supabase', 'status', '-o', 'json'], {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'ignore'],
  })
  const status = JSON.parse(raw.slice(raw.indexOf('{'))) as Record<string, string>
  return {
    apiUrl: status.API_URL ?? 'http://127.0.0.1:54321',
    publishableKey: status.PUBLISHABLE_KEY ?? status.ANON_KEY ?? '',
    secretKey: status.SECRET_KEY ?? status.SERVICE_ROLE_KEY ?? '',
  }
}

/**
 * The stack for a test file.
 *
 * Throws rather than returning something half-filled. These suites are the only
 * proof RLS holds, so "the stack was not reachable" has to stop the run and say
 * so — never quietly leave the assertions unexecuted.
 */
export function readStack(): Stack {
  const fromEnv: Stack = {
    apiUrl: process.env[ENV_KEYS.apiUrl] ?? '',
    publishableKey: process.env[ENV_KEYS.publishableKey] ?? '',
    secretKey: process.env[ENV_KEYS.secretKey] ?? '',
  }

  const stack = fromEnv.apiUrl && fromEnv.secretKey ? fromEnv : readStackFromCli()

  if (!stack.apiUrl || !stack.publishableKey || !stack.secretKey) {
    throw new Error(
      'The local Supabase stack could not be read. Run `npx supabase start` before ' +
        '`npm run test:db`. These suites are not allowed to skip themselves quietly.',
    )
  }

  return stack
}

/** Names the environment variables the global setup writes. */
export const STACK_ENV_KEYS = ENV_KEYS
