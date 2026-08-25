Implement Phase 9 (Data ownership) from docs/04-ROADMAP.md.

- CSV import: upload, detect delimiter and encoding (UTF-8 with BOM, and Windows-1258 for
  Vietnamese exports), map columns to fields, preview the first 20 parsed rows with errors
  highlighted, dry-run summary (N will import, M will be skipped, and why), then commit in a
  single transaction. Never partially import.
- Export: CSV per entity plus one JSON of everything, and a manifest of attachment paths
  with signed URLs valid for 24 hours.
- Vehicle sold flow: date, sale price, then a closing summary — total owned cost, km driven,
  cost per km, months owned, mods installed — rendered as a page worth screenshotting. The
  vehicle archives; nothing is deleted.

Acceptance: you can leave the app with all your data and come back with it intact.

This is the last phase in docs/04-ROADMAP.md. In your final AUTOPILOT-NOTES.md section,
add a short list of what you would build next and why, based on what you have learned about
this codebase — not from the roadmap, which ends here.
