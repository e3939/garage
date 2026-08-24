# Claude Code prompts

Paste one at a time. Each assumes `CLAUDE.md` and `docs/` are in the repo root and committed.
Never run two phases in one session — context bleed makes Claude Code sloppy about scope.

---

## P0 — Session opener (use at the start of every session)

```
Read CLAUDE.md and every file in docs/ before doing anything.

Then tell me, in under 150 words:
1. Which phase of docs/04-ROADMAP.md we're on, based on git log and the current branch.
2. Anything in the working tree that's uncommitted or half-finished.
3. Anything in the docs that contradicts the code as it currently stands.

Don't write code yet.
```

---

## P1 — Phase 0, foundation

```
Implement Phase 0 from docs/04-ROADMAP.md on a new branch `chore/foundation`.

Specifics:
- Next.js App Router, TypeScript strict, Tailwind. No component library.
- Put every token from docs/03-DESIGN.md into globals.css as CSS custom properties, then
  map them into tailwind.config.ts so I write `bg-surface` and `text-ink`, never `bg-[#FBF7EC]`.
- Fonts via next/font: Archivo Expanded (display), Inter Tight (body), JetBrains Mono (data).
  Subsets: latin, latin-ext, vietnamese. JetBrains Mono subset to digits and punctuation only.
- @phosphor-icons/react installed, with a barrel file at components/icons/index.ts re-exporting
  only the icons in the canonical mapping table. Nothing imports from the package directly —
  this keeps the bundle small and the vocabulary consistent.
- Supabase: local CLI setup, linked project, `supabase/migrations/` working, typed client
  factories for server and browser in lib/supabase/.
- Auth: email magic link. Protected layout. Sign-out. No sign-up form beyond the email field.
- App shell: bottom nav with five items (Today, Ledger, Garage, Money, Settings), header slot,
  a brick FAB slot. Static routes with placeholder content is fine.
- PWA: manifest, maskable icons generated from a simple mark, installable on iOS and Android.
- ESLint rule that fails on emoji codepoints in app/, components/, lib/, supabase/.
- GitHub Actions: typecheck, lint, build on every PR.

Stop when the acceptance checklist for Phase 0 passes. Show me the token file and the tailwind
config before you build the rest of the shell.
```

---

## P2 — Phase 1, schema and money core

```
Implement Phase 1 from docs/04-ROADMAP.md on `feat/schema-money`.

Work in this order and pause after each for my review:

1. Write the migrations from docs/02-DATA-MODEL.md. One file per logical group
   (enums, core tables, car tables, money tables, views, RLS, storage policies).
   Show me the full SQL before running anything.
2. Generate TypeScript types from the schema into lib/supabase/types.ts.
3. lib/money.ts — minor units, currency exponents from a table not a constant, VND formatting
   (dot separators, ₫ suffix, no decimals), and parseAmount() handling "150k", "1.2m",
   "150.000", "150000", negative values, and garbage input.
4. lib/budget.ts — resolveBucket(), resolveCountsTowardBudget(), and amortiseSlices() that
   matches v_expense_impact exactly, remainder on the first slice.
5. Vitest for 3 and 4. Include: 100 over 3 months, 1 over 12 months, negative amounts,
   zero-decimal vs two-decimal currencies, and every parseAmount input above.

Then prove RLS: create two test users via the CLI, insert data as one, and show me a query as
the other returning zero rows.
```

---

## P3 — Phase 2, expenses

```
Implement Phase 2 from docs/04-ROADMAP.md on `feat/expenses`.

Priorities in order: speed of entry, correctness of the bucket/budget-impact model, then
everything else.

- Quick-add bottom sheet from the FAB: amount field autofocused with inputmode="decimal",
  the parsed value echoed beneath it as I type, category chips (most-used first, computed
  server-side), Save. That's the whole default flow.
- A "More" disclosure reveals: date, vehicle, note, merchant, photos, bucket override,
  budget-impact switch, amortisation, odometer.
- The budget-impact switch shows plain language: "Counts toward August" / "Kept out of August",
  using the expense's own month, not today's.
- Amortisation: if amount > median(last 90 days) × profiles.amortise_suggest_multiplier,
  show "Spread this over ___ months" inline. Never preselect it.
- Ledger: keyset pagination, virtualised over 40 rows, grouped by day with a day subtotal,
  filters for date range / category / bucket / vehicle / has-photo / amount range, and search
  over note and merchant.
- Every write optimistic with useOptimistic. Every delete gets an Undo toast.
- Category management in Settings: create, rename, recolour, reassign icon from the Phosphor
  barrel, set default bucket and default budget impact, archive.

Server Components for all reads. Aggregate day subtotals in SQL.
```

---

## P4 — Phase 3, vehicles

```
Implement Phase 3 from docs/04-ROADMAP.md on `feat/vehicles`.

- Vehicle CRUD plus a first-run onboarding flow: nickname, make, model, year, purchase date,
  purchase price, current odometer, colour swatch, hero photo. Everything except nickname is
  skippable and editable later.
- Hero photo: compress client-side to max 1600px / ~400KB webp before upload, show progress,
  store at {user_id}/{vehicle_id}/{uuid}.webp, serve via a cached signed URL helper.
- Vehicle home: hero image, a spec strip (year · make · model · trim · transmission · fuel),
  and four odometer-strip figures — total invested, cost per km, this month's car spend,
  next service due. Service is a placeholder until Phase 6; render the panel, show "Not set up".
- v_vehicle_totals implemented in SQL. No client-side reduction.
- Odometer trigger keeping vehicles.odometer_km as the max known reading. If a lower reading
  is submitted, don't reject it — save it and surface a small "Lower than last reading (X km)"
  note on the row.
- The Monthly / All-in / Car-only switcher: a segmented control component, state in the URL
  search params, default from profiles.default_view, persisted back on change. Wire it to
  every total that exists so far. Every total renders its view label adjacent — no exceptions.
```

---

## P5 — Phase 4, attachments and timeline

```
Implement Phase 4 from docs/04-ROADMAP.md on `feat/timeline`.

- Attachments: multi-select, client compression, parallel upload with per-file progress,
  reorder, caption, delete. Reusable <AttachmentField> used by every entity that has photos.
- Signed URL helper: server-side, 1-hour TTL, cached in memory per request, batch-generates
  for a page of timeline rows in one round trip.
- v_timeline in SQL, keyset paginated by (occurred_on, created_at, id).
- The build-log feed on the vehicle page: day-grouped, each row typed by timeline_kind with
  its canonical icon, fuel fill-ups collapsed into a single grouped row per month that
  expands. Photos render as the torn-edge tilted thumbnails from docs/03-DESIGN.md — derive
  the tilt from a hash of the row id so it's stable.
- Timeline notes: a cost-free entry with title, body, date, odometer, photos. Add it from the
  FAB's secondary action on the vehicle page.
- Full-screen photo viewer: swipe between attachments, pinch zoom, caption, close.

Watch the payload here. Images are the biggest performance risk in the app — reserve aspect
ratios, lazy-load below the fold, and show me the route's transferred size before and after.
```

---

## P6 — Phase 5, mod planner

```
Implement Phase 5 from docs/04-ROADMAP.md on `feat/mod-planner`.

- Board with columns Dreaming / Researching / Saving / Ordered / Installed. On mobile it's a
  horizontally snapping column carousel, not a squeezed five-up grid. Column headers carry a
  count and a subtotal.
- Drag to reorder within a column and move between columns, working properly with touch.
  Persist board_order. Optimistic.
- Mod detail sheet: title, description, priority as named levels, estimated cost as a min/max
  range, target date, links list, notes, inspiration photos, dependencies.
- Dependencies: multi-select of other mods on the same vehicle, cycle-checked server-side with
  a clear error naming the cycle. A mod with uninstalled dependencies shows a LinkBreak icon
  and "Blocked by: <names>".
- Build sheet: total estimated cost of the whole plan, broken down by status, in an odometer
  strip at the top of the board.
- Mark installed: opens the expense form pre-filled with the estimate midpoint, the vehicle,
  bucket car_project, category "Mods & Parts", today's date, and mod_plan_id set. After save,
  the mod shows actual (sum of all linked expenses) vs estimate with a signed variance.
- Planning accuracy on the vehicle page: sum(actual) / sum(estimate) over installed mods,
  shown as a percentage with a one-line plain reading ("You spend 12% more than you plan").
- Before/after: pick one inspiration photo, compare against the hero photo in a drag slider.
  Two images, one handle, no extra animation.
```

---

## P7 — Phase 6, maintenance, fuel, parts

```
Implement Phase 6 from docs/04-ROADMAP.md on `feat/car-records`.

Maintenance:
- Seed the default schedule set from docs/01-PRODUCT.md when a vehicle is created. All rows
  editable and deletable.
- v_service_due with due_km, due_date, km_remaining, days_remaining, state.
  Due soon = within 500km or 30 days. Whichever of km/date comes first wins.
- Vehicle home shows the single most urgent item as a small gauge. Not a banner.
- "Mark done" creates a service record and offers, in the same sheet, to log the expense.
  One flow, one confirmation.

Fuel:
- Log form: date, odometer, litres, total cost, full-tank toggle, station, photo. Derive and
  display price-per-litre live as I type so I can sanity-check it.
- v_fuel_consumption between consecutive full tanks, accumulating partial fills, skipping any
  interval where missed_previous is true.
- Show L/100km and km/L together, a 3-fill rolling average, cost per km, and a consumption
  sparkline. Overlay markers on the chart for mods installed on that date.

Parts:
- Inventory list grouped by status. Add from scratch or from an existing expense.
- Removing from the car asks keep / sell / bin. Sell prompts for an amount and writes a
  negative expense linked to the same mod, so the mod's net cost is correct.

Verify the consumption maths against two real fill-ups I'll give you before you call it done.
```

---

## P8 — Phase 7, budgets, funds, reports, recurrences

```
Implement Phase 7 from docs/04-ROADMAP.md on `feat/money-tools`.

- Budgets: an overall monthly figure plus optional per-category caps. Copy-from-last-month.
  All reads go through v_expense_impact — amortisation must be respected here or the whole
  model is a lie.
- The tachometer arc from docs/03-DESIGN.md: 240°, ticks every 10%, sweep once on load,
  ember past redline. No alarm behaviour.
- Funds: name, optional linked mod, target, monthly contribution. Contributions logged
  manually. Show balance, progress, and projected completion date computed from the
  contribution rate. When a linked mod is marked installed, offer to draw down the fund and
  flag the expense funded_from_fund.
- Recurring templates: cadence, next due, active toggle. A Supabase cron job inserts drafts
  on the due date. Drafts land in a confirmation tray on /today with amount editable before
  confirming. Nothing enters the ledger without me confirming it.
- Reports: month-over-month totals (both views side by side), category breakdown, life vs car
  split, top ten expenses of a period. Recharts, restyled to the tokens — no default palette,
  no gridline clutter, tabular mono for all axis labels.
```

---

## P9 — Phase 8, polish

```
Implement Phase 8 from docs/04-ROADMAP.md on `feat/polish`.

Build the four signature elements properly — they're the reason this app is worth using:
1. Odometer strip with rolling digits (120ms/digit, 20ms stagger right-to-left, the easing in
   the doc). Cross-fade under prefers-reduced-motion.
2. The budget arc sweep, once per session.
3. Milestone stamps: rotation derived from the row id, ink-density noise, rendered in the
   timeline. Implement the automatic milestone detection listed in docs/01-PRODUCT.md.
4. Receipt card torn edges.

Then the floor: empty states with a Duotone icon and one line of direction, skeletons with no
shimmer, Undo on every destructive or ambiguous write, dark mode per the doc, visible focus
rings, alt text derived from context, graceful failure and retry on a dropped connection with
no data loss from the quick-add sheet.

Finish with a Lighthouse mobile run against the Phase 0 performance budget. Show me the
numbers and the three largest route bundles. If anything misses, fix it before the PR.
```

---

## P10 — Phase 9, data ownership

```
Implement Phase 9 from docs/04-ROADMAP.md on `feat/import-export`.

- CSV import: upload, detect delimiter and encoding (UTF-8 with BOM, and Windows-1258 for
  Vietnamese exports), map columns to fields, preview the first 20 parsed rows with errors
  highlighted, dry-run summary (N will import, M will be skipped, why), then commit in a
  transaction. Never partially import.
- Export: CSV per entity and a single JSON of everything, plus a manifest of attachment paths
  with signed URLs valid for 24 hours.
- Vehicle sold flow: date, sale price, then a closing summary — total owned cost, km driven,
  cost per km, months owned, mods installed — rendered as a page I could screenshot. The
  vehicle archives; nothing is deleted.
```

---

## Reusable prompts

**Review before merge**
```
Review the diff on this branch against CLAUDE.md and the relevant docs/ sections.
List, in order of severity: spec violations, RLS gaps, performance budget risks, accessibility
misses, and any emoji or hardcoded hex that slipped through. Don't fix anything yet — just the
list, with file and line.
```

**When something's slow**
```
This route feels slow: <route>. Measure before guessing — show me the server timing, the
transferred bytes, and the component render tree. Then propose the smallest change that gets
it under the Phase 0 budget. One change, not five.
```

**When you disagree with me**
```
I want <change>. Before building it, tell me in three sentences what it breaks or complicates
in the current model. If it's fine, say so and build it.
```

**Keeping docs honest**
```
The code and docs/ have drifted. Go through docs/01, 02 and 03 and update anything that no
longer matches what's built. Don't change the code to match the docs — the code is the reality
now. Show me a summary of every edit.
```

---

## Setup prompt — run this before P1

Use after you've created the cloud project and run `supabase login` yourself.

```
Read docs/05-OPS.md. Set up the local development environment:

1. Initialise Supabase in the repo (`supabase init`) and start the local stack.
2. Create .env.local from .env.example, filling the local URL and keys from the
   `supabase start` output. Confirm .env.local is gitignored before writing it.
3. Copy .claude-settings.json to .claude/settings.json and commit it.
4. Add npm scripts: db:reset, db:new, db:types, db:diff, db:logs — thin wrappers so I never
   have to remember the CLI flags.
5. Add gitleaks as a pre-commit hook via husky.
6. Verify: `npm run db:reset` completes clean, Studio loads at 127.0.0.1:54323, and
   `npm run dev` serves the app against local Supabase.

Do not run `supabase link` or `supabase db push` — those are mine. Tell me when to run them.
```

## Deploy prompt — first time only

```
Prepare the first deploy. Do the parts that don't need my credentials:

- Verify the production build passes and no server-only env var is reachable from a client
  component.
- Write docs/DEPLOY.md listing exactly which environment variables I need to set in Vercel,
  what each is for, and where to find its value.
- Add the Supabase cron job SQL for recurring expenses as a migration.

Then give me the ordered list of commands to run myself, with what to check after each.
```

---

# Autonomous running

## The phase runner — use this instead of the plain phase prompts

Paste this once, then paste the phase prompt (P1, P2, …) as the next message.

```
For this session you're running autonomously. Rules:

WORK CONTINUOUSLY. Don't check in with me for approval on implementation decisions. When a
spec in docs/ is ambiguous, take the simpler reading, build it, and keep a running list of
every assumption you made. Show me that list at the end, not as you go.

SELF-VERIFY BEFORE MOVING ON. After each meaningful chunk: typecheck, lint, run the tests,
and `npx supabase db reset` if you touched the schema. Fix what you broke before continuing.
Don't leave the tree broken between chunks.

STOP IMMEDIATELY AND ASK ME if any of these happen:
- The same test or build error survives three genuine fix attempts. Say what you tried and
  what you think is actually wrong. Do not try a fourth time.
- A migration would drop or rename a column that already holds data.
- The work needs a credential, a password, or a dashboard I have to click through.
- You want to change anything in docs/. Docs are the contract; propose the edit, don't make it.
- The phase turns out to need something a later phase was supposed to build.
- Anything at all touching the cloud database or a git push. Those are gated in
  .claude/settings.json and I'll approve them by hand.

DO NOT START THE NEXT PHASE. When this phase's acceptance line in docs/04-ROADMAP.md passes,
commit, then stop and give me the handoff below.

HANDOFF, at the end:
1. What you built, in five bullets, in plain language.
2. Every assumption you made where the spec was ambiguous.
3. Anything in the phase you deliberately didn't build, and why.
4. The exact commands for me to run, in order, with what I should see after each.
5. What you'd check first if something looks wrong.

Acknowledge these rules in one line, then wait for the phase prompt.
```

## Mid-run check (safe to paste while it's working)

```
Pause. Two things, briefly: what are you working on right now, and are you still inside this
phase's scope? Then carry on.
```

## Phase review — paste after the handoff, before you approve anything

```
Before I approve this:

1. Prove RLS holds: create a second test user, insert as the first, query as the second,
   show me it returns zero rows.
2. Production build — report the three largest route bundles against the performance budget
   in CLAUDE.md.
3. List anything you built that isn't in this phase's roadmap entry, and anything in the
   entry you didn't build.
4. Anything you're not confident about.

Don't fix anything yet. Just the report.
```

## Recovery — when a phase has gone wrong

```
This phase has drifted. Don't try to patch it.

Tell me: what's salvageable, what should be thrown away, and whether it's cheaper to fix
forward or delete the branch and restart the phase with a corrected prompt. Recommend one.
If restarting, write me the corrected prompt including whatever you learned this time.
```
