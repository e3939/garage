Implement Phase 8 (Polish) from docs/04-ROADMAP.md.

The four signature elements from docs/03-DESIGN.md, built properly — they are the reason
this app is worth using rather than a spreadsheet:

1. Odometer strip with rolling digits: 120ms per digit, 20ms stagger right-to-left, the
   easing in the doc. Cross-fade instead under prefers-reduced-motion.
2. The budget arc sweep, once per session, never again during it.
3. Milestone stamps: rotation derived from the row id so it is stable but varied down the
   feed, ink-density noise, rendered in the timeline. Implement the automatic milestone
   detection listed in docs/01-PRODUCT.md.
4. Receipt card torn edges.

Then the quality floor:
- Empty states: Duotone icon at 32px, one sentence of direction, one button. Replace the
  "arrives in Phase N" placeholder copy everywhere — every phase now exists.
- Skeletons rather than spinners, in --paper-sink, no shimmer.
- Undo on every destructive or ambiguous write.
- Dark mode per docs/03-DESIGN.md. This is where it ships, not before.
- Visible focus rings, alt text derived from context, colour never carrying meaning alone.
- Graceful failure and retry on a dropped connection, with no data loss from the quick-add
  sheet.

Finish with a Lighthouse mobile run against the performance budget as revised in CLAUDE.md
(shared baseline + 40KB per route). Report the numbers and the three largest route bundles.
Fix anything that misses before finishing.
