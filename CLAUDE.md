# CLAUDE.md — Project constitution

Read this file at the start of every session. If a request conflicts with anything here,
stop and say so before writing code.

Project codename: **Garage** — a personal expense tracker and planner where car ownership
is the main event, not a category.

---

## 1. Non-negotiables

1. **No system emoji. Anywhere.** Not in the UI, not in seed data, not in commit messages,
   not in toast copy. All iconography comes from `@phosphor-icons/react`. If a concept has
   no Phosphor glyph, draw an inline SVG in `components/icons/` — do not fall back to emoji.
2. **Speed is a feature.** Budgets below. A change that regresses them gets reverted, not debated.
3. **Mobile-first.** Design at 390px wide first, then scale up. Every primary action must be
   reachable one-handed.
4. **Never invent schema.** The schema lives in `docs/02-DATA-MODEL.md`. Changing it means a
   new migration file plus an edit to that doc in the same commit.
5. **RLS on every table, no exceptions.** A table without a policy is a bug, even in dev.
6. **Money is integer minor units.** Never a float. See §5.
7. **Ask before scope-creeping.** If a prompt implies work outside the current phase, list it
   and wait. Do not helpfully build the next three features.

---

## 2. Stack

| Layer | Choice | Notes |
|---|---|---|
| Framework | Next.js (App Router) + TypeScript strict | Server Components for reads |
| Styling | Tailwind CSS | Tokens only — see `docs/03-DESIGN.md` |
| Icons | `@phosphor-icons/react` | Regular weight for UI, Duotone for feature moments |
| Database | Supabase Postgres | Migrations in `supabase/migrations/`, applied via CLI |
| Auth | Supabase Auth, email magic link | Single user, but built multi-tenant from day one |
| Files | Supabase Storage | Buckets: `receipts`, `inspiration`, `vehicles` |
| Data fetching | Server Components + Server Actions | `useOptimistic` for writes |
| Charts | Recharts | Restyled to the tokens, no default colours |
| Forms | react-hook-form + zod | One zod schema per entity, shared client/server |
| Dates | date-fns | App-wide timezone: `Asia/Ho_Chi_Minh` |
| Image compression | `browser-image-compression` | Client-side before upload, always |
| Hosting | Vercel | PWA manifest + installable |

**Not used:** Redux, tRPC, Prisma, an ORM of any kind, a component library, a CSS-in-JS
runtime, `moment`, emoji-based icon fonts.

---

## 3. Performance budget

Measured on a mid-range Android over simulated 4G, production build.

- First Contentful Paint under 1.2s
- Largest Contentful Paint under 1.8s
- Interaction to Next Paint under 150ms
- Route JS payload under 120KB gzipped per route
- Every write feels instant: optimistic UI first, server reconciles after
- Lists over 40 rows are virtualised
- No layout shift when images load — always reserve aspect ratio

Rules that keep this true:
- Default to Server Components. `"use client"` requires a reason in a comment above it.
- No client-side data fetching waterfalls. Fetch in parallel in the server component.
- Images through `next/image` with explicit `sizes`.
- Aggregate in SQL (views, RPC), never by pulling rows to the client and reducing.

---

## 4. Repository layout

```
app/                    Next.js routes
  (app)/                Authenticated shell
    today/              Quick-add + this month at a glance
    ledger/             All expenses, filtering, search
    garage/[vehicleId]/ Vehicle home: spec, timeline, costs
      plan/             Mod planner board
      service/          Maintenance schedule + history
      fuel/             Fuel log
      parts/            Parts inventory
    money/              Budgets, funds, reports
    settings/
components/
  ui/                   Primitives: Button, Sheet, Field, Money, Odometer...
  icons/                Custom SVG only where Phosphor has no match
lib/
  supabase/             Client + server factories
  money.ts              Minor-unit maths and formatting
  budget.ts             Bucket + amortisation logic
  queries/              Typed data access, one file per domain
supabase/
  migrations/           NNNN_description.sql, sequential, never edited once merged
  seed.sql              Categories, default service intervals
docs/                   Specs. Source of truth. Keep current.
```

---

## 5. Money rules

- Stored as `bigint` in **minor units** of the expense's currency.
- Default currency **VND**, which has **zero decimal places** — 150000 VND is stored as
  `150000`, not `15000000`. The currency's exponent comes from `lib/money.ts`, never hardcoded.
- Display with thousands separators and no decimals for VND: `150.000 ₫`.
- Input accepts shorthand: typing `150k` means 150,000 and `1.2m` means 1,200,000. Show the
  parsed value under the field as you type so it can never be ambiguous.
- Never do arithmetic across currencies without an explicit stored rate on the row.

---

## 6. Git workflow

- `main` is always deployable. No direct commits.
- One phase from `docs/04-ROADMAP.md` = one branch = one PR.
- Branches: `feat/`, `fix/`, `chore/`, `docs/` + short kebab description.
- Conventional commits: `feat(ledger): add bucket filter`. Body explains *why*, not *what*.
- Migrations are append-only. A merged migration is never edited — write a new one.
- Before opening a PR: typecheck, lint, build, and a manual pass of the phase's
  acceptance checklist.
- PR description template: what changed, which doc sections it implements, what was
  deliberately left out, how to test by hand.

---

## 7. Working style with me

- When a spec is ambiguous, pick the simpler reading, build it, and note the assumption in
  the PR. Do not stall waiting for me.
- When you disagree with a spec, say so once, clearly, with the trade-off. Then do it my way
  if I hold.
- Show diffs for schema changes before running migrations.
- Don't write tests for everything. Do write them for: `lib/money.ts`, `lib/budget.ts`
  (amortisation and bucket resolution), and fuel-economy calculations. Those are where a
  silent bug costs real trust.
- No placeholder content in committed code. If you need sample data, put it in `seed.sql`.

---

## 8. Copy voice

Plain, confident, a bit dry. The app is a service logbook, not a coach.

- Yes: "No fuel logged yet. Add your first fill-up to start tracking consumption."
- No: "Oops! Looks like there's nothing here yet!"
- Buttons name the outcome: "Log expense", "Mark installed", "Add fill-up".
- The word "Submit" never appears. Neither does "Oops", "Awesome", or an exclamation mark
  outside a genuine milestone.
