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

---

## Phase 1 — Schema and money core

Branch: `feat/01-schema-money` (the roadmap names this branch `feat/schema-money`; the branch
already existed under the other name when the run started and was left alone, matching what
Phase 0 did).

### What was built

- **Nine migrations, replaying clean from zero**, one per logical group: enums, core tables,
  car tables, money tables, attachments, views, RLS, storage, and the trigger that gives a new
  user their categories. Seventeen tables, every column, constraint, index and enum from
  `docs/02-DATA-MODEL.md`, verified column-by-column against that document after the reset.
- **RLS on all seventeen tables, four policies each, and a guard that enforces it.** The last
  block of `0007_rls.sql` walks `pg_class` and raises if any public table has RLS off or fewer
  than four policies, so a future migration that adds a table and forgets its policies fails
  the reset instead of shipping an open table. Grants are explicit too, because this stack
  does not auto-expose new tables to the Data API roles.
- **`lib/money.ts`** — integer minor units throughout, exponents from an ISO 4217 lookup table
  (zero-decimal, three-decimal and four-decimal currencies all listed; anything unlisted falls
  back to two), VND formatting as `150.000` with the dong sign trailing, arithmetic helpers
  that throw on a non-integer, and `parseAmount` for what someone actually types on a phone.
- **`lib/budget.ts`** — `resolveBucket`, `resolveCountsTowardBudget` and `amortiseSlices`, the
  last of which is a deliberate mirror of `v_expense_impact` down to the remainder rule and
  the behaviour on negatives.
- **144 tests.** 94 hermetic ones covering money and budget, and 50 integration ones against
  the local stack that prove RLS holds and that `amortiseSlices` and the view agree row for
  row. The integration file is skipped unless `GARAGE_DB_TESTS=1`, so `npm test` needs no
  Docker; `npm run test:db` runs it.

### Proof that RLS holds

`npm run test:db`, against a database freshly reset from zero. Two users are created through
the local auth admin API, the first inserts a row into every one of the seventeen tables plus
an object in the `receipts` bucket, and the second is then examined. 50 assertions, all
passing:

| Check | Result |
|---|---|
| First user sees their own rows, all 17 tables (positive control) | passes for every table |
| Second user sees any of the first user's rows, all 17 tables | **zero rows, every table** |
| Second user reads `v_expense_impact` | **zero rows** |
| Second user's own visible data | 15 categories, 1 profile, nothing else |
| Second user inserts an expense with `user_id` = first user | rejected, HTTP 403 |
| Second user updates the first user's expense | 0 rows changed, value intact |
| Second user deletes the first user's expense | 0 rows deleted, row intact |
| Second user downloads the first user's receipt | rejected |
| Second user uploads into the first user's storage folder | rejected |

The positive control matters as much as the negative one: without it, "the second user sees
nothing" would also pass if the API were returning nothing to anybody. **No row belonging to
the first user was visible to the second. This is not a phase failure.**

Amortisation parity, read straight out of the view for a 100 VND expense over 3 months:

```
 impact_month | amount
--------------+--------
 2026-08-01   |     34
 2026-09-01   |     33
 2026-10-01   |     33
```

`amortiseSlices` returns exactly that, and the same for 1 over 12, both refunds, a 24-month
spread crossing a year end, and an odd amount over 7 months.

### Assumptions

1. **Only `v_expense_impact` was built.** The phase prompt lists "views" as a migration group,
   but `docs/04-ROADMAP.md` assigns the other four to the phases that build the screens
   reading them: `v_vehicle_totals` to Phase 3, `v_timeline` to Phase 4, `v_fuel_consumption`
   and `v_service_due` to Phase 6. Phase 1's own roadmap entry names `v_expense_impact` alone.
   Writing the others now would also have meant inventing semantics that are not in the data
   model — see the `km_driven` note below — so they were left for their phases. `0006_views.sql`
   says so in a comment.
2. **`v_vehicle_totals` will need a column that does not exist yet.** The document defines
   `km_driven` as "odometer minus odometer at purchase", but `vehicles` has no purchase
   odometer — only `odometer_km` and `odometer_at`. Phase 3 will need either a new column or
   a different definition, and this is a decision, not a coding detail. Nothing was invented.
3. **Attachments got their own migration.** It is polymorphic across six other tables, so it
   cannot be created before them; splitting it out was cleaner than adding six deferred
   foreign keys. Same reasoning, smaller, applies to `expenses.mod_plan_id`, `fund_id` and
   `recurring_id`: the columns are created with the table in `0002` and their foreign keys are
   added in `0003` and `0004` once the targets exist.
4. **Migrations are numbered `0001_`, not timestamped.** `CLAUDE.md` section 4 says
   `NNNN_description.sql, sequential`. The Supabase CLI accepts it; a probe migration was run
   first to confirm before anything real was written.
5. **`profiles` has no `user_id`, so its policies key on `id`.** It is keyed by the auth user
   id, exactly as the document defines it.
6. **`mod_dependencies` has no `user_id` either**, because the document does not give it one.
   Its policies read ownership through `mod_plans`, and insert and update require *both* ends
   of the edge to belong to the caller, so a dependency can never be pointed at someone
   else's mod.
7. **Two triggers were added that the data model implies but does not spell out.**
   `auth.users` inserts a `profiles` row, and that row seeds the fifteen system categories.
   Without the first, the second could never fire, because nothing else in the app writes to
   `profiles`.
8. **Category colours come from the bucket vocabulary.** The seed table in
   `docs/02-DATA-MODEL.md` has no colour column but `categories.colour_hex` is `not null`, so
   the three bucket colours in `docs/03-DESIGN.md` were used: life is `#6B6357` (ink-soft),
   running is `#578769` (fire-green), project is `#A95031` (fire-brick). All fifteen are
   recolourable; `is_system` only prevents deletion.
9. **`seed.sql` is a comment.** The document says system categories are seeded "on first
   sign-in via a trigger on `profiles`", and `seed.sql` runs against an empty database with no
   users in it, so the rows cannot live there. The file exists so a reset stays quiet and so
   there is an obvious home for genuinely global seed data later.
10. **No check constraints beyond the ones the document states.** `distance_unit`,
    `volume_unit`, `default_view`, `fuel_type` and `transmission` carry their allowed values
    as SQL comments, matching how the document writes them. zod will enforce them at the edge
    in the phases that build the forms. The constraints the document *does* state are all
    present: the amortisation range, the bucket-and-vehicle rule, one non-null service
    interval, the single-owner rule on attachments, no self-dependency, and budgets landing on
    the first of a month.
11. **Two uniqueness rules use `nulls not distinct`.** `budgets (user_id, month, category_id)`
    so the overall budget row is one per month rather than unlimited, and
    `milestones (user_id, vehicle_id, kind) where auto` so a garage-wide milestone is awarded
    once. Postgres 15 and up; the local stack is 17.
12. **Amounts are `number` in TypeScript, not `bigint`.** They are `bigint` in Postgres, but
    supabase-js hands them back as numbers, and `bigint` does not survive JSON or a form field
    without ceremony. Every helper asserts `Number.isSafeInteger`, which caps a single amount
    at about nine quadrillion minor units — nine million billion dong. If that stops being
    enough the assertion will say so loudly rather than quietly losing precision.
13. **`parseAmount` resolves the one genuinely ambiguous input by digit count, not by
    currency alone.** A lone separator followed by exactly three digits is grouping, so
    `150.000` is a hundred and fifty thousand in both VND and USD. Fewer digits than the
    currency has decimal places is a fraction, so `150.00` is $150 but is unreadable in VND
    and returns null. More than three digits can only be a fraction, because no thousands
    group is four digits long. A shorthand suffix overrides all of it: `1.2m` is always 1.2
    million. `0.005` is rejected as grouping — a leading group of zero gives it away — and
    read as a fraction instead.
14. **`k`, `m` and `b` are the shorthand suffixes.** The Vietnamese `tr` (triệu) and `tỷ` were
    not added; they are not in the spec and guessing at input conventions unattended felt like
    the wrong call. Easy to add to `MULTIPLIER_POWERS` if you want them.
15. **`formatMoney` normalises the non-breaking space** that `Intl` puts between the number and
    the currency sign, so the output is literally `150.000 ₫` and a test or a snapshot can
    compare it without knowing about U+00A0. Preventing a line break there is CSS's job.
16. **`resolveBucket` keeps the bucket consistent with the vehicle**, because the check
    constraint will not accept anything else. Attaching a vehicle to a life expense makes it
    `car_running`; removing the vehicle from a project expense makes it `life`. The form is
    expected to show the chip changing rather than doing this silently.
17. **The default budget policy is a constant.** `docs/01-PRODUCT.md` says it is editable in
    Settings, but `profiles` has no column for it, so `resolveCountsTowardBudget` takes an
    optional `policy` argument that Settings can pass once there is somewhere to store one.

### Not built, and why

- **The four other views**, per assumption 1.
- **The odometer trigger on `vehicles`.** The data model describes it; `docs/04-ROADMAP.md`
  puts it in Phase 3 alongside odometer entry, and there is nothing to maintain the column
  from until then. The column exists with its default.
- **The trigger that rolls a `service_records` insert up into its schedule's `last_done_*`.**
  Same reasoning: the data model describes it, the roadmap puts maintenance in Phase 6.
- **Fuel-economy tests.** `CLAUDE.md` section 7 asks for them; the calculation lives in
  `v_fuel_consumption`, which is Phase 6. They belong with it.
- **Anything touching the cloud.** No `supabase db push`, no link, no deploy. Local only,
  as instructed.
- **`.env.example` is untouched** — this phase introduced no application environment
  variables. `GARAGE_DB_TESTS` is a test flag, not app config, and is set by
  `npm run test:db`. The Phase 0 note about `.env.example` still stands and is still the one
  thing a human needs to check by hand.

### Where confidence is low

- **`parseAmount`'s ambiguity rule is a judgement call**, specifically that `150.000` in a
  two-decimal currency reads as a hundred and fifty thousand rather than as `150.000` rounded
  to `150.00`. It is consistent and it is tested, but it is the kind of rule worth disagreeing
  with. It is one branch in one function if you want it changed.
- **The seeded category colours** are three colours across fifteen categories. That is the
  bucket vocabulary applied literally, and the ledger will read as buckets, but a designer may
  want fifteen distinguishable swatches instead. The seed table in the document has no colour
  column, so this was not a choice the document made.
- **`grant select, insert, update, delete on all tables in schema public`** covers everything
  that exists at the moment `0007` runs. Tables added by later migrations will need their own
  grants. The RLS guard at the end of `0007` catches a missing policy but not a missing grant;
  a missing grant fails loudly at the first query, so it is a noisy failure rather than a
  silent one.
- **`v_expense_impact` reads `amortize_months` on every row of `expenses`** with no index
  helping the lateral expansion. It is correct and it is fast on a single user's data; whether
  it stays fast at ten thousand expenses is a Phase 7 question, and the answer if not is a
  materialised monthly rollup, not a change to the rule.
- **Storage policies were proved through the storage API**, upload and download, both
  directions, which is the path the app will use. They were not exercised through the S3
  protocol endpoint.

### What a reviewer should check first

1. **Run `npm run test:db` yourself**, ideally after `npx supabase db reset`. It is the
   acceptance criterion for this phase and it takes four seconds. Everything else here is
   secondary to those 50 assertions.
2. **Read `supabase/migrations/0007_rls.sql`**, in particular the guard block at the end and
   the `mod_dependencies` policies. Those two are where a mistake would be quiet.
3. **Decide the `v_vehicle_totals` / `km_driven` question** (assumption 2) before Phase 3
   starts, since it may mean a new column on `vehicles` and therefore an edit to
   `docs/02-DATA-MODEL.md`.
4. **Sanity-check the fifteen seeded categories** — names, icons, buckets and especially which
   ones count toward the budget — by signing in as a fresh user and opening the category list.
   `Mods & Parts`, `Track & Events` and `Tools & Garage` should be the three that do not.
5. **Argue with `parseAmount`** if you want to. Type a few amounts the way you actually would
   and check `lib/money.test.ts` covers them.
