import { describe, expect, it } from 'vitest'
import { ESLint } from 'eslint'

/**
 * The emoji ban is the one lint rule the project treats as non-negotiable, so
 * it is checked end to end through the real eslint.config.mjs rather than in
 * isolation — a rule that works but is wired to the wrong files is still a bug.
 */

const eslint = new ESLint()

async function lint(source: string, filePath: string) {
  const [result] = await eslint.lintText(source, { filePath })
  return result?.messages ?? []
}

const FUEL_PUMP = String.fromCodePoint(0x26fd)
const CAR = String.fromCodePoint(0x1f697)

describe('garage/no-emoji', () => {
  it('rejects an emoji in a TypeScript source file', async () => {
    const messages = await lint(`export const label = '${FUEL_PUMP}'\n`, 'lib/probe.ts')

    expect(messages.map((m) => m.ruleId)).toContain('garage/no-emoji')
  })

  it('rejects an emoji in a migration', async () => {
    const messages = await lint(
      `insert into categories (name) values ('Fuel ${CAR}');\n`,
      'supabase/migrations/00000000000000_probe.sql',
    )

    expect(messages.map((m) => m.ruleId)).toContain('garage/no-emoji')
  })

  it('reports the offending codepoint so the fix is obvious', async () => {
    const messages = await lint(`export const a = '${FUEL_PUMP}'\n`, 'lib/probe.ts')
    const emoji = messages.find((m) => m.ruleId === 'garage/no-emoji')

    expect(emoji?.message).toContain('U+26FD')
  })

  it('leaves ordinary copy alone', async () => {
    const messages = await lint(
      "export const label = 'No fuel logged yet.'\n",
      'lib/probe.ts',
    )

    expect(messages.map((m) => m.ruleId)).not.toContain('garage/no-emoji')
  })

  it('leaves typographic marks that are not iconography alone', async () => {
    const messages = await lint("export const mark = '© ® ™'\n", 'lib/probe.ts')

    expect(messages.map((m) => m.ruleId)).not.toContain('garage/no-emoji')
  })
})
