Implement Phase 5 (Mod planner) from docs/04-ROADMAP.md.

- Board with columns Dreaming / Researching / Saving / Ordered / Installed. On mobile a
  horizontally snapping column carousel, not a squeezed five-up grid. Column headers carry a
  count and a subtotal.
- Drag to reorder within a column and move between columns, working properly with touch.
  Persist board_order. Optimistic.
- Mod detail sheet: title, description, priority as named levels (Needed / Next up /
  Someday / Dreaming), estimated cost as a min–max range, target date, links list, notes,
  inspiration photos, dependencies.
- Dependencies: multi-select of other mods on the same vehicle, cycle-checked server-side
  with an error naming the cycle. A mod with uninstalled dependencies shows a LinkBreak icon
  and "Blocked by: <names>".
- Build sheet: total estimated cost of the plan, broken down by status, in an odometer strip
  at the top of the board.
- Mark installed: opens the expense form pre-filled with the estimate midpoint, the vehicle,
  bucket car_project, category "Mods & Parts", today's date, and mod_plan_id set. After
  saving, the mod shows actual (sum of all linked expenses) against estimate with a signed
  variance.
- Planning accuracy on the vehicle page: sum(actual) / sum(estimate) across installed mods,
  as a percentage with a one-line plain reading ("You spend 12% more than you plan").
- Before/after: pick one inspiration photo, compare against the hero photo in a drag slider.
  Two images, one handle, no animation beyond the drag.

Acceptance: planning a mod makes you want to fund it.
