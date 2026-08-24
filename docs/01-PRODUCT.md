# 01 — Product specification

## The thesis

Most expense trackers treat a car as a category. For someone who actually cares about their
car, that's backwards: the car is a running project with a budget, a plan, a history, and a
mood. Garage is a competent general expense tracker whose centre of gravity is the vehicle.

Two things it must do that nothing else does well:

1. Let a large, lumpy, discretionary car cost exist **without distorting the monthly picture**.
2. Turn the spending into a **build log** — something worth scrolling back through, with
   photos, that makes the next mod feel closer rather than more expensive.

---

## Core concept 1 — the bucket and the switch

Every expense carries two independent properties.

**Bucket** — what kind of money this is:

| Bucket | Meaning | Examples |
|---|---|---|
| `life` | Everything not car | Rent, food, phone |
| `car_running` | The cost of the car existing and moving | Fuel, insurance, oil change, parking, tyres worn out |
| `car_project` | Discretionary spend to make the car more than it was | Coilovers, wheels, tune, wrap, track day |

**Budget impact** — `counts_toward_budget`, a boolean.

Each category carries a *default* for both. Each expense can override both. That's the whole
mechanism, and it's deliberately small: one enum, one boolean.

Default policy (editable in Settings):
- `life` → counts
- `car_running` → counts
- `car_project` → does **not** count

So a set of coilovers lands in the ledger, appears in the build log, adds to lifetime cost of
ownership, and stays out of "did I overspend in August".

**Three views of the same data**, switchable from a single segmented control that persists:

- **Monthly** — only `counts_toward_budget = true`. This is your discipline number.
- **All-in** — everything. This is the truth.
- **Car only** — every bucket beginning `car_`, ignoring the budget switch. This is the
  cost-of-ownership number.

Never show a total without the view label next to it. Ambiguity here destroys the whole point.

## Core concept 2 — amortisation

Any expense can be spread across N months (`amortize_months`, default 1). A 24,000,000 VND
set of tyres over 24 months contributes 1,000,000 to each of 24 monthly views, while the
ledger and the timeline still show one purchase on one date for the full amount.

Rules:
- Amortisation only affects **budget-impact views**. Cash-out views and lifetime totals always
  use the full amount on the purchase date.
- Spreading starts on the expense date's month.
- An expense with `counts_toward_budget = false` ignores amortisation entirely — it's already
  out of the monthly picture.
- The UI offers amortisation as a suggestion, not a default: when a single expense exceeds
  a threshold (default: 3× the median expense of the last 90 days) the form quietly offers
  "Spread this over ___ months".

This is the pressure valve for the genuinely ambiguous purchase — the one that isn't a mod
and isn't really a normal month either.

## Core concept 3 — the build log

One reverse-chronological feed per vehicle, mixing:

- Expenses with photos and notes
- Mods changing status (planned → ordered → installed)
- Service records
- Fuel fill-ups (collapsed — grouped as "4 fill-ups, 1,240,000 ₫" unless expanded)
- Milestones (automatic and manual)
- Free-text entries with photos and no cost at all — a good drive, a meet, a wash

The feed is the thing you show someone. It should look like a stamped service booklet, not a
bank statement. See `docs/03-DESIGN.md`.

---

## Feature set

### A. General expense tracking (must be genuinely good)

- Fast add: amount → category → done. Everything else optional and progressively disclosed.
- Categories with icon, colour, default bucket, default budget impact. User-editable, seeded.
- Recurring expenses: monthly/quarterly/annual templates that generate a draft on the due
  date and sit in an "Awaiting confirmation" tray until confirmed. Never silently created.
- Monthly budget: one overall figure plus optional per-category caps.
- Ledger with search, date range, category, bucket, vehicle, has-photo, amount range.
- Reports: month over month, category breakdown, life vs car split, largest expenses.
- CSV import (mapping UI) and CSV/JSON export. Export is a first-class feature — the data is
  yours and leaving must be easy.

### B. Vehicles

Multi-vehicle from day one. A vehicle has: nickname, make, model, year, trim, plate, colour
swatch, fuel type, transmission, purchase date, purchase price, current odometer, hero photo,
and status (`owned`, `sold`).

**Vehicle home** shows: hero photo, a spec strip, and four live numbers —
total invested, cost per km, this month's car spend, next service due.

Selling a car doesn't delete it. It archives into a closed chapter with a final summary:
total owned cost, km driven, cost per km, months owned, and the full log preserved.

### C. Mod planner

Kanban board, columns = status:

`Dreaming` → `Researching` → `Saving` → `Ordered` → `Installed`

A mod holds: title, description, priority, estimated cost (min/max), target date, part links,
notes, inspiration photos, dependencies, and — once installed — a link to the real expense.

**Priority** is named, not numbered: `Needed`, `Next up`, `Someday`, `Dreaming`.
Numbers imply a precision nobody has about their own wants.

**Dependencies:** a mod can require other mods. The board shows a small chain indicator, and
a mod whose dependencies aren't installed shows as blocked with the blocker named.

**Plan → actual:** marking a mod `Installed` opens the expense form pre-filled with the
estimate, the vehicle, bucket `car_project`, and a link back. After saving, the mod displays
estimate vs actual variance. A running "planning accuracy" figure across all installed mods
appears on the vehicle page — it is one of the most quietly addictive numbers in the app.

**The build sheet:** the mod board rolls up into a total — what the current plan costs, split
by status, so "everything I want" has a single honest number attached to it.

**Before / after:** inspiration photos attached to a mod can be pinned against the vehicle's
current hero photo in a drag slider on the vehicle page. This is the motivation feature.
Keep it simple: two images, one handle, no animation beyond the drag.

### D. Maintenance

- Service schedule items: name, interval in km and/or months, last done (km + date).
- Due calculation uses whichever comes first. States: `ok`, `due soon`, `overdue`.
  "Due soon" thresholds: within 500km or 30 days.
- A due item on the vehicle home shows as a small gauge, not a red banner. Nagging is rude.
- Completing a service creates a service record and optionally an expense in one step.
- Seeded defaults on vehicle creation: engine oil + filter (5,000km / 6mo), air filter
  (15,000km / 12mo), brake fluid (—/24mo), coolant (40,000km/24mo), spark plugs
  (40,000km/—), transmission fluid (60,000km/—), tyre rotation (10,000km/—).
  All editable and deletable — they are a starting point, not doctrine.

### E. Fuel

- Log: date, odometer, litres, total cost, full-tank flag, station, optional photo.
- Consumption computed between consecutive **full tanks** (partial fills accumulate into the
  next full-tank interval). Show L/100km and km/L both — different habits.
- Cost per km, rolling 3-fill average, and a sparkline of consumption over time.
- A meaningful consumption change after a mod is annotated on the chart automatically:
  "Intake installed" marker on the date. This is the kind of thing a petrolhead will
  screenshot.

### F. Parts inventory

What's on the car and what's on the shelf. Name, brand, part number, status
(`on_car`, `shelf`, `sold`, `binned`), installed/removed dates, warranty expiry, linked
expense, photo. Removing a part from the car prompts: keep, sell, or bin. Selling records a
negative expense so the true cost of a mod nets out correctly.

### G. Funds (sinking funds)

Named savings targets, optionally linked to a mod. Set a target and a monthly contribution;
contributions are recorded (manually — this app does not touch a bank). Shows progress and
projected completion date: "At 2,000,000 ₫/month, funded by March 2027."

When a linked mod is marked installed, the fund is drawn down and the expense is flagged
`funded_from_fund` — so it can be excluded from the monthly view without any guilt at all.

### H. Milestones

Automatic: first expense, first mod installed, every 10,000km, one year of ownership,
10 fill-ups, first full service cycle, 100 log entries. Manual: anything, with a photo.
Milestones appear in the timeline as a stamped mark. They are rare enough to feel earned —
do not add more without asking.

---

## Screen inventory (v1)

| Route | Job |
|---|---|
| `/today` | Add an expense in under five seconds; see the month at a glance |
| `/ledger` | Find and edit anything |
| `/garage` | Vehicle switcher when more than one |
| `/garage/[id]` | Vehicle home: hero, spec strip, four numbers, timeline |
| `/garage/[id]/plan` | Mod board + build sheet total |
| `/garage/[id]/service` | Schedule + history |
| `/garage/[id]/fuel` | Fill-up log + consumption chart |
| `/garage/[id]/parts` | Inventory |
| `/money` | Budgets, funds, reports |
| `/settings` | Categories, currency, defaults, export, account |

---

## Explicitly out of scope for v1

Bank sync, OCR receipt scanning, multi-user sharing, public build pages, notifications/push,
offline mode, native apps, split expenses, loan/finance amortisation schedules, insurance
claim tracking. Each is a reasonable v2 candidate. None gets built without a decision.

## Open assumptions (override any time)

- Currency defaults to **VND**, zero decimals, `₫` suffix, `.` thousands separator.
- Timezone `Asia/Ho_Chi_Minh`, week starts Monday.
- Distance in **km**, volume in **litres**.
- Vehicle details are entered in onboarding — nothing about a specific car is hardcoded.
- Single user. Auth exists and RLS is real, but there is no sharing UI.
