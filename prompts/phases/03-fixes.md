Fix three things reported from real use on an iPhone before the next roadmap phase.

1. THE EXPENSE FORM'S "MORE" SECTION IS CONFUSING.

   a. The vehicle dependency is invisible. Choosing "Mods & Parts" should give a project
      expense, but the bucket silently falls back to Life when no vehicle exists. The only
      explanation is small grey text under a dropdown, three fields away from the bucket
      chips it is controlling. Make the causality obvious at the point of the chips:
      disabled car buckets say why, and offer a way to add a vehicle from here (or, until
      Phase 3 ships vehicle creation, a clear line explaining the fallback where it happens).
   b. "Do not spread" is brick-filled like the primary Save button while being the current
      state rather than a call to action. Restyle so the selected state is legible without
      shouting. Also, a number field plus separate 3/6/12/24 chips is two controls doing one
      job — simplify to one.
   c. Bucket chip states are muddy. Selected, unselected and disabled must be clearly
      distinct; the disabled ones currently read as merely faint.
   d. Reconsider section order. It is currently Date, Vehicle, Bucket, Budget impact,
      Spread, Merchant. Bucket and budget impact are the conceptual core; date and merchant
      are incidental. Put the thinking at the top.

   Judgement call, decide and note it: the category already implies both bucket and budget
   impact, so the full control set may be unnecessary on every open. Consider collapsing to
   one line — "Kept out of August · Project" with a Change affordance — expanding into
   controls only on override. Same power, far less visual load. If you take this route, keep
   the override path exactly as capable as it is now.

2. LEDGER ROWS TRUNCATE BECAUSE THE NOTE IS IN THE DETAIL LINE. Drop it. The detail line
   becomes bucket · category · vehicle. Mark a note's presence with a small Phosphor glyph
   at the line end (NoteBlank, ICON_UI size). Same treatment for the attachment indicator if
   one does not already exist — one glyph per signal, at the line end, consistent order.
   Full note stays in the detail sheet. Re-measure afterwards: how many of eight rows still
   truncate?

   Add to docs/03-DESIGN.md the rule that the ledger detail line carries structured fields
   only, never free text, and why. This doc edit is pre-approved.

3. THE PERFORMANCE BUDGET IS WRONG AND HAS BEEN SINCE PHASE 0. CLAUDE.md sets 120KB
   gzipped per route; every route sits at 131–136KB, essentially all React 19 + Next 16
   baseline rather than application code. Re-express it as **shared baseline + 40KB per
   route**, measure and record the current baseline figure, and update the budget section of
   CLAUDE.md accordingly. This edit is pre-approved. A budget that can never pass is not a
   budget.
