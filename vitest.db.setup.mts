import { readStackFromCli, STACK_ENV_KEYS } from './lib/supabase/test-stack'

/**
 * Reads the local stack once, before any test worker starts, and passes it on
 * through the environment.
 *
 * Without this every one of the eleven database suites spawned `npx supabase
 * status` for itself. Under load those spawns took seconds each and the suite
 * became unreliable — the failure mode being suites reporting their tests
 * skipped rather than failing, which is the worst way for a test suite to
 * break.
 */
export default function setup() {
  const stack = readStackFromCli()
  process.env[STACK_ENV_KEYS.apiUrl] = stack.apiUrl
  process.env[STACK_ENV_KEYS.publishableKey] = stack.publishableKey
  process.env[STACK_ENV_KEYS.secretKey] = stack.secretKey
}
