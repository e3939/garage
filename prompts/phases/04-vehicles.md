Implement Phase 3 (Vehicles) from docs/04-ROADMAP.md.

PRE-APPROVED SCHEMA CHANGE — do this first, in its own migration:

`v_vehicle_totals` defines km_driven as odometer minus odometer at purchase, but `vehicles`
has no purchase odometer — only `odometer_km` and `odometer_at`. Add
`purchase_odometer_km int` to `vehicles`, defaulting to the vehicle's `odometer_km` at
creation so a car entered mid-life still computes correctly. Update docs/02-DATA-MODEL.md in
the same commit as the migration, per CLAUDE.md section 4. Both edits are approved.

Then the phase:

- Vehicle CRUD plus a first-run onboarding flow: nickname, make, model, year, purchase date,
  purchase price, current odometer, colour swatch, hero photo. Everything except nickname is
  skippable and editable later.
- Hero photo: compress client-side to max 1600px / ~400KB webp before upload, show progress,
  store at {user_id}/{vehicle_id}/{uuid}.webp, serve through a cached signed-URL helper.
- Vehicle home: hero image, spec strip (year · make · model · trim · transmission · fuel),
  and four odometer-strip figures — total invested, cost per km, this month's car spend,
  next service due. Service is Phase 6; render the panel and show "Not set up".
- `v_vehicle_totals` in SQL. No client-side reduction.
- Odometer trigger keeping `vehicles.odometer_km` as the max known reading. A lower reading
  is saved, not rejected, and surfaces a small "Lower than last reading (X km)" note on the
  row.
- The Monthly / All-in / Car-only switcher: a segmented control, state in URL search params,
  default from `profiles.default_view`, persisted back on change. Wire it to every total in
  the app. Every total renders its view label adjacent — no exceptions.
- The expense form's vehicle dependency (fixed in the previous phase) now has real vehicles
  to point at. Make sure the "add a vehicle" path from that form works.

Acceptance: the same set of expenses produces three different, correct, clearly-labelled
totals, and cost per km is right.
