Implement Phase 2 (Expenses end to end) from docs/04-ROADMAP.md.

Priorities in order: speed of entry, correctness of the bucket and budget-impact model,
then everything else.

- Quick-add bottom sheet from the FAB: amount field autofocused with inputmode="decimal",
  the parsed value echoed beneath it as the user types, category chips with most-used
  first (computed server-side), and Save. That is the entire default flow.
- A "More" disclosure reveals: date, vehicle, note, merchant, photos, bucket override,
  budget-impact switch, amortisation, odometer.
- The budget-impact switch shows plain language using the expense's own month, not today's:
  "Counts toward August" / "Kept out of August".
- Amortisation: when the amount exceeds the median of the last 90 days multiplied by
  profiles.amortise_suggest_multiplier, show "Spread this over ___ months" inline.
  Never preselect it.
- Ledger: keyset pagination, virtualised beyond 40 rows, grouped by day with a day subtotal
  computed in SQL, filters for date range / category / bucket / vehicle / has-photo /
  amount range, and search across note and merchant.
- Every write optimistic via useOptimistic. Every delete gets an Undo toast.
- Category management in Settings: create, rename, recolour, pick an icon from the Phosphor
  barrel, set default bucket and default budget impact, archive.

Server Components for all reads. No client-side aggregation — totals and subtotals are
computed in SQL.

Photo attachment UI can be stubbed if Phase 4 owns the upload pipeline; note the decision
in AUTOPILOT-NOTES.md either way.
