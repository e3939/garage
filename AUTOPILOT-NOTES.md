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

---

## Phase 2 — Expenses end to end

Branch: `feat/02-expenses` (the roadmap names this branch `feat/expenses`; as in the two
phases before it, the branch already existed under the other name when the run started and
was left alone).

### What was built

- **Quick add, in two taps.** A brick FAB in the shell's `@fab` slot opens a native
  `<dialog>` bottom sheet with the amount field already focused, `inputmode="decimal"`, and
  the parsed value echoed underneath as you type. Category chips sit directly beneath it,
  ordered most-recently-used first by SQL, and Save closes the sheet. Everything else —
  date, vehicle, merchant, note, bucket, budget impact, amortisation, odometer, photos — is
  behind one **More** disclosure.
- **The bucket and budget-impact model, wired to `lib/budget.ts`.** The bucket resolves from
  the chip override, then the category default, then the vehicle; attaching a vehicle moves
  an expense into a car bucket and removing it moves it back, because the database will not
  store anything else. The switch underneath reads **"Counts toward August" / "Kept out of
  August"**, named from the expense's own month rather than today's. Amortisation appears
  inline, unselected, only when the amount clears the median of the last ninety days times
  `profiles.amortise_suggest_multiplier` — a threshold computed by a view, not the browser.
- **A ledger that pages by keyset and aggregates in SQL.** One `ledger_page` function does
  the filtering (date range, category, bucket, vehicle, has-photo, amount range), the search
  across note and merchant, the day subtotals, the attachment counts and the category and
  vehicle joins, and returns one page ordered by `(occurred_on, created_at, id)` descending.
  Rows are fixed-height and virtualised past forty. Filters live in the URL, so a filtered
  ledger is a different server render rather than a client-side pass over downloaded rows.
- **Optimistic everything, with undo on delete.** One `useOptimistic` queue lives in the
  authenticated layout — not in the ledger — because quick add hangs off the FAB slot, a
  sibling of the page, and an expense added there has to land in the ledger and move the
  month figure in the same frame. The month figure moves by `impactInMonth` from
  `lib/budget.ts`, the mirror of `v_expense_impact`, so an amortised expense contributes its
  slice rather than its total. Delete is a hard delete with an Undo toast that puts the row
  back under its original id and original `created_at`.
- **Category management in Settings.** Create, rename, recolour from the token palette, pick
  an icon from a ninety-glyph Phosphor catalogue, set the default bucket and default budget
  impact with the same two controls the expense form uses, and archive with undo. There is
  no delete: seeded categories are not deletable and an expense should not lose its category
  because the category stopped being useful.

### Proof it works

`npm test` — 138 hermetic tests. `npm run test:db` — 66 against a database reset from zero,
16 of them new in `lib/queries/ledger.db.test.ts` covering keyset paging with no repeats or
drops, day subtotals staying whole across a page boundary, every filter, case-insensitive
search, the amortisation remainder rule through `v_expense_impact`, the category ranking and
the suggestion threshold.

Beyond the test suite, the production build was driven over HTTP with a real magic-link
session, including calling the Server Actions directly by their action ids:

| Check | Result |
|---|---|
| `/today`, `/ledger`, `/settings`, `/settings/categories` render signed in | 200, no error markup |
| Monthly figure with a 24-month spread and a kept-out 24m purchase | `335.000 dong` — 150.000 + 85.000 + 2.400.000/24 |
| Day subtotals under `?bucket=car_project` and `?min=1000000` | narrow with the filter, as SQL computes them |
| 120 expenses in the ledger | virtualised, spacers present, "Load older" offered |
| `createExpenseAction` | row in the database under the client-generated id |
| `updateExpenseAction` | amount and merchant changed |
| `createExpenseAction` with amount 0 | `{ok:false, error:"Enter an amount"}` |
| `createExpenseAction` with a car bucket and no vehicle | rejected by the schema |
| `deleteExpenseAction` then `restoreExpenseAction` | gone, then back with the original `created_at` |
| A second user calling delete and update on the first user's expense | zero rows affected, row untouched |

### Assumptions

1. **Zod does not ship to the browser.** `import { z } from 'zod'` imports a namespace object
   that does not tree-shake; measured, it was **72KB gzipped** in the route bundles for
   `/today` and `/ledger` — more than half the entire performance budget, for a ten-field
   form. The schemas are still one per entity and still the only gate on a write: the Server
   Actions parse with them, and the client imports `ExpenseWrite` and `CategoryWrite` as
   **types only**, so the object it assembles cannot drift from what the server accepts. The
   client checks the two things a person can actually get wrong (no amount, no date) for
   instant feedback and lets the server answer for the rest. This is a deliberate departure
   from the letter of CLAUDE.md section 2 in favour of section 1 point 2 and section 3.
   `zod/mini` would let both be true; converting the schemas is a contained change.
2. **Category icons are rendered on the server.** Rendering ninety Phosphor glyphs in the
   settings picker client-side cost **81KB gzipped**. The catalogue is split in two —
   `components/icons/catalog-names.ts` holds only strings, `catalog.tsx` holds the
   components — and Server Components hand finished elements to the client as props. Same
   pixels, no JavaScript. The ledger and the quick-add chips take their icons the same way.
3. **Amount filters compare the signed amount, not its magnitude.** "Amount from 100.000"
   excludes a −250.000 refund. The simpler reading, and the one that matches how the field
   is labelled.
4. **The amortisation median is taken over the magnitude of the amount** (`abs`), so a large
   refund does not drag the threshold down, and over non-draft expenses only.
5. **Category ranking is recent use first, then lifetime use, then the seeded sort order.**
   "Most used" with no window would let a category used forty times three years ago sit
   ahead of one used four times last month. The window is ninety days, the same one the
   amortisation median uses.
6. **Overriding the bucket away from the category's own bucket hands the budget default back
   to the per-bucket policy.** `resolveCountsTowardBudget` prefers the category default over
   the policy, which is right while the expense is in the category's own bucket and wrong
   once it is not — a grocery moved to `car_project` should default to kept out. The switch
   still wins over both. This is a form-level decision; `lib/budget.ts` is untouched.
7. **Editing an expense re-derives what was never overridden.** An edit records an override
   only where the stored value actually differs from what the category would have produced,
   so changing the category on an untouched expense still moves its bucket, while an expense
   that was deliberately moved stays where it was put.
8. **The optimistic day subtotal is adjusted on the client.** Subtotals are computed in SQL,
   per the phase brief; the only client arithmetic is the delta from writes still in flight,
   which is unavoidable if a write is to be visible before the server answers. It is a pure
   function in `lib/expenses/optimistic.ts` and is unit-tested against the SQL rule.
9. **Loading more pages resets when the server sends a fresh page.** After a write
   revalidates the route, pages loaded beyond the first are dropped and the ledger is back at
   page one. The alternative is keeping rows the server has since changed. Scroll position is
   the browser's.
10. **A pending row dated older than the last loaded page appears at the bottom of the list**
    rather than on the page it belongs to. It corrects itself the moment the server answers.
11. **The undo toast appears after the delete succeeds**, not before. Showing it immediately
    would be a few hundred milliseconds snappier and would let Undo race the delete it is
    undoing.
12. **A write against another user's row returns success.** RLS makes it affect zero rows;
    PostgREST reports that as a successful update of nothing. The row is untouched and
    nothing is disclosed, so the action does not go looking for a row it is not allowed to
    see just to produce a better error.
13. **The colour picker offers the seven design-system colours plus a native colour input.**
    Category colour is user data and lands in `colour_hex` as a literal, so it cannot be a
    token; the palette is the tokens' hexes so the default categories keep reading as buckets.
14. **The icon catalogue is ninety curated glyphs, not the whole Phosphor barrel.** The full
    barrel is roughly fifteen hundred icons. Adding one is one line in
    `components/icons/catalog-names.ts` and one in the map.
15. **The odometer field appears only once a vehicle is attached**, because a reading with no
    car to attach it to is rejected by the schema.
16. **Buckets, categories and vehicles filter as OR-within, AND-across** — any of the chosen
    categories, and any of the chosen buckets, and so on.

### Not built, and why

- **Photo attachment is a stub.** The More disclosure has a Photos row with a disabled
  control and the line "Photo upload arrives with the timeline in Phase 4." The roadmap gives
  the compression and upload pipeline to Phase 4 and the phase brief allows the stub. The
  **has-photo filter is real** and runs against the `attachments` table, so it will start
  finding things the moment Phase 4 writes rows — it was tested by inserting an attachment
  by hand.
- **The odometer does not update the vehicle.** `vehicles.odometer_km` is a denormalised
  maximum maintained by a trigger that Phase 3 owns, along with the "that reading is lower
  than the last one" flag. An expense stores its own `odometer_km` today and the trigger will
  pick it up.
- **The Monthly / All-in / Car-only switcher.** Roadmap Phase 3. `/today` shows the monthly
  figure and labels it "Monthly", because a total without its view named is ambiguous
  (docs/01-PRODUCT.md).
- **The odometer roll, the budget arc, stamps, torn-edge receipt cards and skeletons.** All
  four signature elements and the loading treatment are roadmap Phase 8. The recessed
  `panel-sunken` bed the hero figure sits on is here; the digits do not roll yet.
- **Recurring expenses and the draft confirmation tray.** Phase 7. `ledger_page` already
  takes `p_include_drafts` and defaults it to false, so drafts are invisible until that tray
  exists.
- **Category reordering by hand.** `sort_order` is stored, respected and editable through the
  database, but there is no drag handle. Not in the phase brief.

### Where confidence is low

- **The performance budget still does not pass, for the same reason as Phase 0.** Measured on
  the production build by summing the gzipped `<script src>` set of each route, excluding the
  38.7KB `nomodule` polyfill bundle that modern browsers never fetch:

  | Route | First-load JS, gzipped |
  |---|---|
  | `/settings` | 131.0KB |
  | `/settings/categories` | 131.0KB |
  | `/today` | 135.2KB |
  | `/ledger` | 136.2KB |

  The ceiling in CLAUDE.md is 120KB. Essentially all of it is the React 19 + Next 16 App
  Router baseline — the same 131KB is on `/settings`, which contains almost nothing. Phase 2
  adds about 5KB on top: react-hook-form, date-fns and every component in this phase. Before
  the two bundle decisions above it was **232KB** on `/today`. As in Phase 0, this needs a
  decision rather than a code change: either the budget is re-expressed as route JS *on top
  of* the shared baseline, or the number moves. The docs were not edited.
- **`next dev` was appending a block to CLAUDE.md on every start.** Next 16 writes an
  agent-rules section into `CLAUDE.md` unless told not to; it did so once during this run and
  was reverted. `agentRules: false` is now set in `next.config.ts`. Worth knowing about,
  because it will happen to any checkout that predates that line.
- **Three indexes and one extension were added that are not in `docs/02-DATA-MODEL.md`:**
  `pg_trgm` plus GIN trigram indexes on `expenses.note` and `expenses.merchant`, which is
  what makes a contains-match search something other than a sequential scan. No table,
  column, enum or constraint changed, so the data contract in that document is intact and it
  was not edited — but if indexes belong in it, these are the ones to add.
- **`NOT MATERIALIZED` in `ledger_page`.** The filter CTE is referenced twice — once for the
  page, once for the day subtotals — and is marked `not materialized` so the planner inlines
  it and the filters reach the index rather than building the whole filtered set first. This
  is right for a personal ledger and was not benchmarked against a hundred thousand rows.
- **The virtual list assumes exact heights.** Ledger rows are 72px and day headings 36px, set
  by the same constants the list measures with, and row text truncates rather than wraps. A
  future row that wraps will misalign the spacers rather than fail loudly.
- **React Compiler skips memoising `ExpenseForm`.** `npm run lint` reports one warning:
  react-hook-form's `watch()` returns a function the compiler cannot memoise safely. The form
  works; it simply is not auto-memoised. Lint exits 0.
- **Nothing was driven through a real browser.** Every server render, every filter, every
  Server Action and the RLS boundary were exercised over HTTP against the production build,
  but the optimistic path, the sheet animation, the focus behaviour on a phone keyboard and
  the scroll-driven virtualisation were not: they need a browser and there was none.

### What a reviewer should check first

1. **Log an expense on a phone and time it.** Tap the FAB, type `150k`, tap a category, tap
   Log expense. The month figure on `/today` should move before the row appears. That is the
   phase's acceptance criterion and the one thing only a human can judge.
2. **The bundle question above.** It is the only acceptance criterion this phase does not
   meet, and it is inherited.
3. **Assumption 1 — zod off the client.** It is a real departure from CLAUDE.md section 2.
   If the trade is unacceptable, `zod/mini` is the way to have both.
4. **Delete something and press Undo**, then check the row came back in the same place in the
   ledger rather than at the top.
5. **A day split across a page boundary.** Log forty-one expenses on one day, scroll, press
   Load older, and confirm the day subtotal reads the same above and below the join.
6. **Rename a system category and archive a custom one**, then check the quick-add chips and
   the ledger rows follow.
