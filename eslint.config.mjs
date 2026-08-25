import coreWebVitals from 'eslint-config-next/core-web-vitals'
import nextTypescript from 'eslint-config-next/typescript'
import garage from './eslint-rules/index.mjs'

const SOURCE = ['app/**/*.{ts,tsx}', 'components/**/*.{ts,tsx}', 'lib/**/*.{ts,tsx}']

const config = [
  {
    ignores: [
      '.next/**',
      'node_modules/**',
      'next-env.d.ts',
      'lib/supabase/types.ts',
      'supabase/.temp/**',
      'supabase/.branches/**',
      'public/**',
      'logs/**',
    ],
  },

  ...coreWebVitals,
  ...nextTypescript,

  {
    files: ['**/*.{ts,tsx}'],
    rules: {
      // Money is integer minor units; a stray `any` is how a float gets in.
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/consistent-type-imports': [
        'error',
        { prefer: 'type-imports', fixStyle: 'inline-type-imports' },
      ],
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
    },
  },

  // --- The emoji ban, over TypeScript sources.
  {
    files: SOURCE,
    plugins: { garage },
    rules: { 'garage/no-emoji': 'error' },
  },

  // --- The emoji ban, over migrations, seed data and email templates.
  {
    files: ['supabase/**/*.{sql,html}'],
    plugins: { garage },
    language: 'garage/text',
    rules: { 'garage/no-emoji': 'error' },
  },

  // --- Nothing outside components/icons may reach into Phosphor directly.
  {
    files: SOURCE,
    ignores: ['components/icons/**'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['@phosphor-icons/react', '@phosphor-icons/react/*'],
              message:
                'Import icons from @/components/icons so the canonical mapping in docs/03-DESIGN.md stays the only source.',
            },
          ],
        },
      ],
    },
  },
]

export default config
