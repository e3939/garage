# Autopilot notes

Notes written by unattended runs. One section per phase. Assumptions, gaps and
things a human should look at before merging.

---

## Phase 0 — Foundation

Branch: `feat/00-foundation` (the roadmap names this branch `chore/foundation`; the branch
already existed under the other name when the run started and was left alone).

### What was built

- **A Next.js 16 App Router project on TypeScript strict**, scaffolded by hand into the
  existing folder so `CLAUDE.md`, `docs/`, `prompts/` and `.claude/` were never touched.
  Scripts: `dev`, `build`, `start`, `lint`, `typecheck`, `test`, `db:reset`, `db:new`,
  `db:types`, `db:diff`, `db:logs`, plus `icons` and `fonts` for the two asset generators.
- **The design system as tokens.** Every colour, type step, radius, spacing step, shadow and
  motion value from `docs/03-DESIGN.md` lives once in `app/globals.css` as a CSS custom
  property, and `tailwind.config.ts` points at those properties. Components are written
  `bg-surface` / `text-ink` / `text-odometer-lg`; there is no way to write `bg-[#FBF7EC]`
  and have it mean anything, because the palette is replaced rather than extended.
- **Three fonts, self-hosted.** Archivo (display, width axis pinned to 125 so it reads
  Expanded) and Inter Tight (body) via `next/font/google` with `latin`, `latin-ext` and
  `vietnamese`; JetBrains Mono via `next/font/local`, subset down to digits, punctuation and
  currency signs by `npm run fonts`.
- **Auth and the shell.** Magic-link sign-in with no password and no sign-up form, a proxy
  that refreshes the session and redirects anonymous traffic, a protected layout that checks
  the user again server-side, five placeholder routes, a bottom bar, a header slot and a
  brick FAB slot (both real App Router parallel routes), sign out, and a PWA manifest with
  maskable icons drawn from an odometer-strip mark.
- **The guardrails.** A custom ESLint rule that fails on any emoji codepoint in `app/`,
  `components/`, `lib/` and `supabase/` — including `.sql` files, via a small plain-text
  ESLint language so one `eslint .` covers both — a rule that blocks importing Phosphor
  outside `components/icons`, a vitest suite covering the emoji rule end to end, and a GitHub
  Actions workflow running typecheck, lint, test and build on pull requests with dummy
  `NEXT_PUBLIC_*` values.

### Proof the emoji rule works

Two probe files were written (`components/emoji-probe.tsx` containing U+26FD, and
`supabase/migrations/00000000000000_emoji_probe.sql` containing U+1F697), `eslint .` reported
both and exited `1`, and the probes were deleted. `eslint .` then exited `0`. The same two
cases are locked in as tests in `eslint-rules/no-emoji.test.mts`, so the proof survives.

### Assumptions

1. **Tailwind 3.4, not Tailwind 4.** The phase prompt names `tailwind.config.ts` and asks for
   tokens to be *mapped into* it. Tailwind 4 would put that mapping in CSS via `@theme` and
   make the file vestigial. Taking the prompt literally, and preferring the better-trodden
   path for an unattended run, this is Tailwind 3.4 with a real config file. Migrating later
   is a contained change: the token values already live in CSS.
2. **The spacing scale is replaced, not extended.** `p-7`, `gap-10` and friends do not exist.
   Three structural sizes were added alongside it because the design doc requires them and
   they are not spacing steps: `touch` (44px, the minimum target), `nav` (64px) and `fab`
   (56px).
3. **`display-lg` and `display` change size at 768px** by moving the CSS variable inside a
   media query, so a single utility class covers both columns of the type scale.
4. **"Archivo Expanded" is Archivo with `wdth` at 125.** Google Fonts has no separate
   Expanded family; the variable font's width axis goes to 125, which is its Expanded end.
   `font-display` sets `font-variation-settings: "wdth" 125`.
5. **The mono subset contains no letters.** `docs/03-DESIGN.md` says subset to digits and
   punctuation, so `L`, `km` and `kWh` inside a `.font-mono` span will fall back to the
   system monospace stack. If mixed unit strings should stay in JetBrains Mono, add
   `[0x41,0x5a],[0x61,0x7a]` to `scripts/subset-mono.mjs` and re-run `npm run fonts` — it
   costs roughly 6KB.
6. **Icons are re-exported from `@phosphor-icons/react/dist/ssr`**, not the package root, so
   they render in Server Components. That entry has no `IconContext`, so size and weight are
   passed explicitly; `ICON_UI`, `ICON_FEATURE` and `ICON_EMPTY` in `components/icons` carry
   the values from the design doc so screens do not invent their own.
7. **Two nav icons are not in the canonical table.** Ledger uses `Receipt`, Money uses
   `ChartDonut` and Garage uses `Car`, all from the table. Today (`House`) and Settings
   (`SlidersHorizontal`) have no canonical row; they are marked as shell chrome in
   `components/icons/index.ts`. Add rows to the table in `docs/03-DESIGN.md` if you want them
   to be canonical — the doc was not edited.
8. **Header and FAB "slots" are parallel routes.** `app/(app)/@header` and `app/(app)/@fab`,
   each with a `default.tsx`. Settings opts out of the FAB by returning `null`. This is what
   lets Phase 2 put the quick-add sheet and Phase 3 the vehicle switcher into the shell
   without the layout growing a prop drill.
9. **`middleware.ts` is `proxy.ts`.** Next 16 deprecates the middleware file convention and
   warns on every build. The Supabase helper moved with it to `lib/supabase/proxy.ts`.
10. **The auth callback accepts both link shapes.** `?code=` (the PKCE default for
    `@supabase/ssr`) and `?token_hash=&type=` (the older implicit email template), so a
    project configured either way signs in rather than erroring on a technicality.
11. **ESLint 9, not 10.** Installing 10 left every plugin in `eslint-config-next` with an
    unsatisfied peer range. 9.x resolves clean.
12. **A no-op service worker ships** (`public/sw.js`, registered in production only). It has a
    fetch handler and does nothing with it — that is what browsers want to see for
    installability. Caching and offline behaviour are Phase 8 and were deliberately not
    started.
13. **Placeholder copy names the phase that will replace it**, e.g. "The ledger, search and
    filters arrive in Phase 2." Plain and dry per the copy voice, and it makes an unfinished
    screen obviously unfinished rather than looking broken.

### Not built, and why

- **`.env.example` was not read and not updated.** The repo's own `.claude/settings.json`
  denies `Read(./.env.*)` and `Bash(cat .env:*)`, so the file was unreadable during this run
  and appending to it blind risked duplicating keys. **This is the one thing to check by
  hand.** `.env.local` was written from `npx supabase status` using the new key names:

  ```
  NEXT_PUBLIC_SUPABASE_URL
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
  SUPABASE_SECRET_KEY
  NEXT_PUBLIC_SITE_URL
  ```

  As a hedge, `lib/env.ts` also accepts the legacy `NEXT_PUBLIC_SUPABASE_ANON_KEY`, so the
  app starts either way. `NEXT_PUBLIC_SITE_URL` is new in this phase and is optional
  (defaults to `http://localhost:3000`); it needs a line in `.env.example`.
- **The gitleaks pre-commit hook.** `docs/05-OPS.md` asks for it in Phase 0, but it is not in
  the roadmap's Phase 0 entry or the phase prompt, and installing the binary needs network
  and a package manager step that is not safe to guess at unattended. Left for a human.
- **The CI check that `SUPABASE_SERVICE_ROLE_KEY` only appears in `server-only` files**
  (`docs/05-OPS.md`). Nothing in the codebase reads the secret key yet, so the guard would
  guard nothing. Worth adding in the phase that introduces the recurring-expense cron job.
- **Dark mode.** `docs/03-DESIGN.md` is explicit that it ships in Phase 8. No `.dark` block
  was written.
- **Migrations and seed data.** Phase 1. `supabase db reset` was run to confirm the CLI path
  works and completes clean; it warns `no files matched pattern: supabase/seed.sql`, which is
  correct for this phase.

### Where confidence is low

- **The performance budget does not currently pass.** A production build serves **134.1KB
  gzipped of first-load JS** on every route (plus a 38.7KB `noModule` polyfill bundle that
  modern browsers never fetch, and 4.4KB of CSS). `CLAUDE.md` sets the ceiling at 120KB per
  route. Almost all of it is the React 19 + Next 16 App Router baseline — Supabase, Phosphor,
  zod and date-fns are all absent from the client bundles, and the pages themselves are
  Server Components shipping essentially nothing. A webpack build was measured for comparison
  and came out worse, so Turbopack was kept. **This needs a decision, not a code change:**
  either the budget is re-expressed as route JS *on top of* the shared baseline, or the
  number moves. The docs were not edited to paper over it.
- **`.env.example` variable names**, per above.
- **The plain-text ESLint language** in `eslint-rules/plain-text-language.mjs` is built on
  `@eslint/plugin-kit`'s `TextSourceCodeBase`. It works and is covered by a test, but it is a
  small and fairly low-level API; an ESLint major could move it. The failure mode is loud —
  lint crashes rather than silently passing.
- **Whether `wdth` 125 reads as "Expanded" to your eye.** It is the widest the variable font
  goes; if it looks too narrow next to the reference, the display face needs to change, not
  the axis value.
- **The magic-link flow was verified over HTTP, not through a real inbox.** A link was
  generated through the local admin API, exchanged at `/auth/callback`, and the resulting
  session cookie was used to load all five protected routes. Mailpit itself was not opened.

### What a reviewer should check first

1. **`.env.example`** — confirm it lists the four variables above, adding
   `NEXT_PUBLIC_SITE_URL` if it does not.
2. **Sign in on your phone.** `npm run dev`, then `http://<your-ip>:3000`. Set
   `NEXT_PUBLIC_SITE_URL` to that address first or the magic link will point at localhost.
   The link arrives in Mailpit at `http://127.0.0.1:54324`.
3. **The colours and fonts at 390px.** Paper background, ink-green focus rings, brick FAB
   bottom-right, wide Archivo in the header, and the bottom bar clearing the home indicator.
4. **`npm run lint` still fails on an emoji** — paste one into any file under `app/` and run
   it.
5. **The bundle budget question** above. It is the only acceptance criterion this phase does
   not meet.
