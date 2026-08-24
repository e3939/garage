# 04 — Roadmap

Ten phases. One branch and one PR each. Do not start a phase until the previous one is
merged and you've walked its acceptance checklist by hand on a phone-sized viewport.

Each phase is shippable. If you stop after any of them you still have a usable app.

---

### Phase 0 — Foundation
`chore/foundation`

Next.js + TypeScript strict + Tailwind, design tokens as CSS variables mapped into the
Tailwind theme, three fonts wired via `next/font` with Vietnamese subsets, Phosphor installed,
Supabase project linked, CLI migrations working, auth with magic link, protected app shell
with bottom navigation, PWA manifest and icons, the emoji lint rule, CI running typecheck +
lint + build.

**Done when:** you can sign in on your phone, the shell renders in the right colours and
fonts, and `npm run lint` fails if someone commits an emoji.

---

### Phase 1 — Schema and money core
`feat/schema-money`

All tables, enums, RLS policies, storage buckets and policies, `seed.sql` with system
categories, `v_expense_impact` view. `lib/money.ts` with minor-unit maths, VND zero-decimal
formatting, and the `150k` / `1.2m` shorthand parser. `lib/budget.ts` with bucket defaults
and amortisation slicing. Unit tests for both, including the remainder rule (100 over 3 =
34/33/33) and negative amounts.

**Done when:** tests pass, and a hand-inserted row in Supabase Studio is invisible to a
second test user.

---

### Phase 2 — Expenses end to end
`feat/expenses`

Quick-add sheet, full expense form, ledger with keyset pagination, edit, delete with undo,
category management. Bucket chip and budget-impact switch with plain-language state.
Amortisation field with the large-expense suggestion. Optimistic writes throughout.

**Done when:** you can log a real expense in under five seconds on your phone, and the
monthly total updates before the network round-trip completes.

---

### Phase 3 — Vehicles and the view switcher
`feat/vehicles`

Vehicle CRUD, onboarding flow for the first vehicle, hero photo upload with client-side
compression, spec strip, vehicle switcher, odometer trigger. The Monthly / All-in / Car-only
switcher wired to every total in the app. `v_vehicle_totals`.

**Done when:** the same set of expenses produces three different, correct, clearly-labelled
totals, and cost-per-km is right.

---

### Phase 4 — Attachments and the timeline
`feat/timeline`

Multi-photo upload, compression pipeline, signed-URL serving with caching, the `v_timeline`
view, the build-log feed with keyset pagination, timeline notes (cost-free entries), receipt
cards with the torn-edge treatment.

**Done when:** the feed of a month's real activity is something you'd voluntarily scroll.

---

### Phase 5 — Mod planner
`feat/mod-planner`

Board with five columns, drag between columns (touch-friendly), mod detail sheet, inspiration
photos, links, dependencies with blocked indicator, build-sheet total by status, priority as
named levels. Mark-installed flow that pre-fills an expense and links back. Estimate-vs-actual
variance and planning accuracy on the vehicle page. Before/after slider.

**Done when:** planning a mod you actually want makes you want to fund it.

---

### Phase 6 — Maintenance, fuel, parts
`feat/car-records`

Service schedules with seeded defaults on vehicle creation, due calculation view, service
records with optional expense in one step, the due gauge. Fuel log, `v_fuel_consumption`,
consumption chart with mod markers. Parts inventory with the remove → keep/sell/bin flow and
negative sale expenses.

**Done when:** consumption between two real full tanks matches your own calculation exactly.

---

### Phase 7 — Budgets, funds, reports, recurrences
`feat/money-tools`

Overall and per-category budgets, the tachometer arc, sinking funds with contributions and
projected completion, drawdown on linked mod install, recurring templates with the cron job
and the confirmation tray, reports (month-over-month, category breakdown, life vs car).

**Done when:** a month where you bought something big shows a sane monthly number and an
honest all-in number, and you understand both without thinking.

---

### Phase 8 — Polish
`feat/polish`

Odometer roll, arc sweep, stamps, milestone detection, empty states, skeletons, toasts with
undo everywhere, dark mode, reduced-motion paths, focus states, alt text audit, offline-ish
resilience (graceful failure, retry, no data loss on a dropped connection).

**Done when:** a Lighthouse mobile run clears the performance budget and accessibility scores
95+.

---

### Phase 9 — Data ownership
`feat/import-export`

CSV import with column mapping and a dry-run preview, CSV and JSON export of everything
including attachment manifests, vehicle archive/sold flow with the closing summary.

**Done when:** you can leave the app with all your data and come back with it intact.

---

## Deferred (decide later, don't build)

Bank sync · receipt OCR · sharing and multi-user · public build pages · push notifications ·
true offline with local-first sync · native apps · loan schedules · insurance claims ·
multi-currency conversion.
