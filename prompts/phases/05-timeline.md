Implement Phase 4 (Attachments and the timeline) from docs/04-ROADMAP.md.

- Attachments: multi-select, client-side compression, parallel upload with per-file progress,
  reorder, caption, delete. One reusable <AttachmentField> used by every entity with photos.
- Replace the Phase 2 photo stub in the expense form with the real thing. The has-photo
  filter already queries `attachments` and should start finding rows immediately.
- Signed-URL helper: server-side, 1-hour TTL, cached per request, batch-generating for a
  whole page of timeline rows in one round trip.
- `v_timeline` in SQL, keyset paginated by (occurred_on, created_at, id).
- The build-log feed on the vehicle page: day-grouped, each row typed by timeline_kind with
  its canonical icon, fuel fill-ups collapsed into one grouped row per month that expands.
  Photos render as the torn-edge tilted thumbnails from docs/03-DESIGN.md, with the tilt
  derived from a hash of the row id so it is stable across renders.
- Timeline notes: cost-free entries with title, body, date, odometer, photos. Added from the
  FAB's secondary action on the vehicle page.
- Full-screen photo viewer: swipe between attachments, pinch zoom, caption, close.

Images are the largest performance risk in this app. Reserve aspect ratios, lazy-load below
the fold, and report the route's transferred size before and after.

Acceptance: a month of real activity produces a feed worth scrolling.
