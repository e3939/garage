Implement Phase 6 (Maintenance, fuel, parts) from docs/04-ROADMAP.md.

MAINTENANCE
- Seed the default schedule set from docs/01-PRODUCT.md when a vehicle is created. Every row
  editable and deletable.
- `v_service_due` with due_km, due_date, km_remaining, days_remaining, state. Due soon =
  within 500km or 30 days; whichever of km or date comes first wins.
- Vehicle home shows the single most urgent item as a small gauge, not a banner.
- "Mark done" creates a service record and offers, in the same sheet, to log the expense.
  One flow, one confirmation. Add the trigger that rolls a service record up into its
  schedule's last_done_* fields — the data model describes it and this is its phase.

FUEL
- Log form: date, odometer, litres, total cost, full-tank toggle, station, photo. Derive and
  show price-per-litre live as the user types, so a typo is obvious.
- `v_fuel_consumption` between consecutive full tanks, accumulating partial fills, skipping
  any interval where missed_previous is true.
- Show L/100km and km/L together, a 3-fill rolling average, cost per km, and a consumption
  sparkline. Overlay markers for mods installed on a given date.
- Add the fuel-economy tests CLAUDE.md section 7 asks for. They belong with this calculation.

PARTS
- Inventory grouped by status. Add from scratch or from an existing expense.
- Removing from the car asks keep / sell / bin. Selling prompts for an amount and writes a
  negative expense linked to the same mod, so the mod's net cost is correct.

Acceptance: consumption between two full tanks matches a hand calculation exactly. Show the
working.
