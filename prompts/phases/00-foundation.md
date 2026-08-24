Implement Phase 0 (Foundation) from docs/04-ROADMAP.md.

Environment setup first — Supabase is already initialised and linked, and the local stack
is already running. Do not run `supabase init`, `supabase link` or `supabase start`.

- Scaffold Next.js (App Router) + TypeScript strict + Tailwind in the current directory.
  There are existing files here (CLAUDE.md, docs/, prompts/, .claude/) — do not delete or
  overwrite any of them.
- Create .env.local from .env.example, filling the local Supabase URL and keys by reading
  them from `npx supabase status`. Confirm .env.local is gitignored before writing it.
- Add npm scripts: dev, build, start, lint, typecheck, test, db:reset, db:new, db:types,
  db:diff, db:logs.

Then the phase proper:

- Put every colour, type and spacing token from docs/03-DESIGN.md into globals.css as CSS
  custom properties, then map them into tailwind.config.ts so components are written as
  `bg-surface` and `text-ink`, never `bg-[#FBF7EC]`.
- Fonts via next/font: Archivo Expanded (display), Inter Tight (body), JetBrains Mono
  (data, tabular figures). Subsets latin, latin-ext, vietnamese. Subset JetBrains Mono to
  digits and punctuation only.
- Install @phosphor-icons/react. Create components/icons/index.ts re-exporting only the
  icons in the canonical mapping table in docs/03-DESIGN.md. Nothing else in the codebase
  imports from the package directly.
- Typed Supabase client factories for server and browser in lib/supabase/.
- Auth: email magic link, protected layout, sign out. No sign-up form beyond the email field.
- App shell: bottom navigation with five items (Today, Ledger, Garage, Money, Settings),
  a header slot, and a brick FAB slot. Placeholder page content is fine.
- PWA: manifest, maskable icons generated from a simple mark, installable.
- An ESLint rule that fails the build on emoji codepoints in app/, components/, lib/, supabase/.
  Prove it works by writing a temporary file containing an emoji, showing lint fails, then
  deleting the file.
- GitHub Actions workflow running typecheck, lint and build on pull requests. Use dummy
  NEXT_PUBLIC_* values so the build resolves without real credentials.

Verify with a production build before you finish.
