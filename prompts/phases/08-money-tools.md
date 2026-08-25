Implement Phase 7 (Budgets, funds, reports, recurrences) from docs/04-ROADMAP.md.

- Budgets: an overall monthly figure plus optional per-category caps, with copy-from-last-
  month. Every read goes through v_expense_impact — amortisation must be respected here or
  the whole model is a lie.
- The tachometer arc from docs/03-DESIGN.md: 240 degrees, ticks every 10%, sweeping once on
  load, ember past redline. No alarm behaviour, no shaking, no flashing.
- Funds: name, optional linked mod, target, monthly contribution. Contributions logged
  manually. Show balance, progress, and a projected completion date computed from the
  contribution rate. When a linked mod is marked installed, offer to draw down the fund and
  flag the expense funded_from_fund.
- Recurring templates: cadence, next due, active toggle. A Supabase cron job inserts drafts
  on the due date. Drafts land in a confirmation tray on /today with the amount editable
  before confirming. Nothing enters the ledger without confirmation.
- This phase introduces the first server-side use of SUPABASE_SECRET_KEY, for the cron
  endpoint. It must be behind `import 'server-only'`, never NEXT_PUBLIC_ prefixed, and
  protected by CRON_SECRET. Add the CI check from docs/05-OPS.md that fails the build if the
  secret key is reachable from client code, and add both variables to .env.example.
- Reports: month-over-month totals with both views side by side, category breakdown, life vs
  car split, top ten expenses of a period. Recharts restyled to the tokens — no default
  palette, no gridline clutter, tabular mono on all axis labels.

Acceptance: a month containing one big purchase shows a sane monthly number and an honest
all-in number, and both are understandable at a glance.
