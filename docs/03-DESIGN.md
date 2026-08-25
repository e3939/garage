# 03 — Design system

## Direction

The reference object is a **stamped service logbook** — the paper booklet that lives in a
glovebox, with dealer stamps, handwritten odometer readings, and a ruled grid. Warm paper,
ink-green rules, a brick-red stamp where something happened. Not a fintech dashboard, not a
racing livery.

The one memorable element is the **odometer strip**: every headline figure is set in a
mechanical, tabular numeral row on a slightly recessed panel, and it rolls when it changes.
Everything else stays quiet so that lands.

---

## Colour

Sampled from the supplied Firenze palette. These five are the source; the rest are derived.

```css
--fire-green:  #578769;   /* ink green — primary, rules, positive */
--fire-cream:  #FDF0AE;   /* highlight paper — stamps, active fills */
--fire-amber:  #F4B354;   /* attention — due soon, in-progress */
--fire-brick:  #A95031;   /* brick — car spend, action, the accent */
--fire-ember:  #833012;   /* deep brick — overspend, destructive, ember state */
```

Derived neutrals — the ivory the app actually sits on. `--fire-cream` is too saturated for a
full-screen background; it becomes a highlight instead.

```css
--paper:       #FBF7EC;   /* app background */
--paper-raise: #FFFDF7;   /* cards, sheets */
--paper-sink:  #F2EBD9;   /* recessed panels, the odometer strip bed */
--rule:        #E3DAC3;   /* hairlines, table rules */
--rule-strong: #CFC2A4;
--ink:         #2A2620;   /* primary text — warm near-black, never #000 */
--ink-soft:    #6B6357;   /* secondary text */
--ink-faint:   #9A9084;   /* tertiary, placeholders */
```

Semantic mapping — components reference these, never the raw ramp:

```css
--bg, --surface, --surface-sunken, --border, --text, --text-muted
--accent:        var(--fire-brick);     /* primary action */
--accent-ink:    #FFFDF7;               /* text on accent */
--positive:      var(--fire-green);     /* under budget, healthy, installed */
--attention:     var(--fire-amber);     /* due soon, ordered, pending */
--critical:      var(--fire-ember);     /* overdue, over budget, destructive */
--highlight:     var(--fire-cream);     /* stamps, selection, milestone marks */
```

**Bucket colours** — consistent everywhere, this is the app's core vocabulary:
- `life` → `--ink-soft` (deliberately unglamorous)
- `car_running` → `--fire-green`
- `car_project` → `--fire-brick`

**Dark mode:** build it, ship it in Phase 8, don't design for it first. The ink-on-paper
metaphor inverts to a dark garage: `--bg: #211E1A`, `--surface: #2A2620`, paper warmth kept,
green and amber lifted ~12% in lightness, brick lifted to `#C4633F` for contrast.

Contrast floor: 4.5:1 for body text, 3:1 for large text and UI borders. `--fire-amber` on
paper fails for text — use it for fills and strokes only, never for words.

---

## Typography

Three faces, all Google Fonts via `next/font/local` self-hosting, subsets
`latin`, `latin-ext`, `vietnamese`.

| Role | Face | Use |
|---|---|---|
| Display | **Archivo Expanded** (variable) | Screen titles, vehicle nickname, milestone stamps. Wide grotesk with plate-lettering DNA. Used sparingly and always in caps or title case. |
| Body | **Inter Tight** | All UI text, forms, labels, body copy. |
| Data | **JetBrains Mono** | Every number: money, odometer, litres, dates in the ledger. `font-variant-numeric: tabular-nums` always on. Subset to digits, punctuation and currency signs. |

Scale (mobile → desktop where they differ):

```
display-lg   32/34  Archivo Expanded 700, tracking -0.02em     Vehicle nickname
display      24/26  Archivo Expanded 600, tracking -0.01em     Screen titles
title        18     Inter Tight 600                            Card headings
body         16     Inter Tight 400, line-height 1.5           Default
input        16     Inter Tight 400                            Form controls; a floor, see below
label        13     Inter Tight 500                            Field labels
caption      12     Inter Tight 400, --text-muted              Meta
eyebrow      12     Archivo Expanded 600, tracking 0.12em, caps Section markers
odometer-lg  34/40  JetBrains Mono 700, tabular                 Hero figures
odometer     18     JetBrains Mono 500, tabular                 Row amounts
```

`odometer-lg` is 34 below 430px and 40 from 430px up, and it is the only step in the scale
that changes below the tablet breakpoint. The reason is that dong amounts are long. The hero
panel is 326px wide inside its padding on a 390pt screen; at 40 it holds thirteen characters
(`100.000.000 ₫`) with 17px to spare and overflows at fourteen, so a total that reaches a
billion breaks the panel. At 34 the same panel holds fifteen (`1.000.000.000 ₫`) with 23px
spare. Two characters of range, bought for six points of size on the one screen size where it
is tight.

Rule: a screen has at most one `display-lg` and one `odometer-lg`. If a design needs two hero
numbers, one of them isn't a hero.

### Form controls have a hard 16px minimum

**Never set a font size below 16px on an `input`, `select` or `textarea`.** This is not a
taste question and it is not negotiable by a design decision.

iOS Safari zooms the whole page in when a control smaller than 16px takes focus, and it does
not zoom back out when the control is blurred. The user is left on a page that is
permanently magnified and scrolls sideways, and nothing in the app looks broken enough to
explain why. One search field at 15px is enough to do it to every screen.

`--text-input` exists as a separate token for this reason, even though it currently holds the
same value as `--text-body`. It is a platform floor, not a step in the type scale: if the body
size is ever revised downward, controls must not follow it down. `INPUT_CLASS` in
`components/ui/field.tsx` carries it, and a base-layer rule on `input, select, textarea`
catches anything that forgets — a utility can still set a *larger* size, which is how the
quick-add amount field renders at 40.

The two non-fixes to avoid: `maximum-scale=1` and `user-scalable=no` in the viewport meta.
iOS Safari has ignored both since iOS 10, and they disable pinch-zoom on the browsers that do
still honour them, which is an accessibility regression in exchange for nothing.

---

## Shape, depth, grid

- Radius: `--r-sm: 6px`, `--r-md: 10px`, `--r-lg: 14px`, `--r-full: 999px`. Nothing larger —
  the paper metaphor has folds, not pills.
- Spacing scale: 4 / 8 / 12 / 16 / 20 / 24 / 32 / 48. Nothing between.
- Elevation is mostly **rules and tint**, not shadow. One shadow token exists,
  `--shadow-sheet: 0 -8px 32px rgba(42,38,32,0.12)`, used only on bottom sheets and modals.
- Recessed panels (the odometer bed) use `--paper-sink` plus `inset 0 1px 0 var(--rule)`.
- Grid: single column on mobile. Gutter is 16px below 600px and 24px from 600px up — the
  gutter stays tight on a phone on purpose, because horizontal space is the scarce axis there
  and a wider gutter buys air by truncating content.
- Content max-width 640px; the app stays a column even on a large screen. It is a logbook,
  not a control room. 640 rather than 720 because 16px body across 720 runs to roughly 95
  characters a line, well past a comfortable measure.
- Ledger rows are 64px, day headings 32px. Fixed, so the list virtualises without measuring.

---

## Icons

`@phosphor-icons/react`. Regular weight at 20px for UI, Duotone at 24px for feature headers
and empty states. Never Fill weight — it reads as an emoji substitute.

Canonical mapping (use these, don't improvise per screen):

| Concept | Icon |
|---|---|
| Fuel | `GasPump` |
| Maintenance / service | `Wrench` |
| Mod / performance | `Gauge` |
| Vehicle | `Car` (or `CarProfile` for the switcher) |
| Odometer / distance | `Path` |
| Money / expense | `Receipt` |
| Budget | `ChartDonut` |
| Fund | `PiggyBank` |
| Part | `Nut` |
| Photo | `Camera` |
| Timeline | `ClockCounterClockwise` |
| Milestone | `SealCheck` |
| Blocked dependency | `LinkBreak` |
| Due soon | `WarningCircle` |
| Add | `Plus` |

**Absolutely no emoji characters in any string, ever.** Lint rule enforces it: a regex over
the emoji unicode ranges runs in CI against `app/`, `components/`, `lib/` and `supabase/`.

---

## Signature elements

These are the "exciting small stuff". Four of them. Do not add a fifth without asking —
delight stops being delightful when it's everywhere.

### 1. The odometer strip
Hero figures sit on a recessed `--paper-sink` panel with hairline top and bottom rules,
digits in tabular mono, separated by faint vertical hairlines every three digits like a
mechanical counter's drum gaps. When the value changes, digits roll vertically —
120ms per digit, staggered 20ms right-to-left, cubic-bezier(0.22, 1, 0.36, 1).
Respects `prefers-reduced-motion` by cross-fading instead.

Used for: monthly total, cost per km, total invested, fund progress, build-sheet total.

### 2. The budget arc
Monthly budget as a 240° tachometer arc, not a bar. Tick marks every 10%. The needle sweeps
in on load (600ms, once, then never again during the session). Past 100% the arc segment
turns `--fire-ember` and the ticks beyond redline get slightly denser — no shaking, no colour
flashing, no alarm. The car metaphor does the emotional work on its own.

### 3. The stamp
Milestones and installed mods render in the timeline as a rotated (−3°) rounded-rect outline
in `--fire-brick` on `--fire-cream`, with `eyebrow`-set text inside — a dealer stamp. Slight
ink-density texture via a low-opacity noise layer. Each stamp's rotation is derived from its
id so it's stable across renders but varied down the feed.

### 4. Receipt cards
An expense with a photo shows the photo as a small torn-edge thumbnail — a CSS mask giving
one irregular edge — tilted by 1–2° from the id hash. Tapping opens the full image. The tilt
is the only playful thing in the ledger; the rows themselves stay strictly aligned.

---

## Motion

- Durations: 120ms (state), 200ms (enter/exit), 320ms (sheet), 600ms (the one arc sweep).
- Easing: `cubic-bezier(0.22, 1, 0.36, 1)` for entrances, `ease-out` for exits.
- Sheets slide from the bottom on mobile, fade+scale(0.98→1) on desktop.
- List items never animate on scroll. Nothing loops. Nothing bounces.
- `prefers-reduced-motion: reduce` disables the odometer roll, the arc sweep, and all
  transforms — opacity only.

---

## Component notes

- **Quick add** is a bottom sheet reachable from a persistent brick FAB. Opens with the
  amount field focused and a numeric keypad. Amount → category chips → Save. Everything else
  is behind a "More" disclosure.
- **View switcher** (Monthly / All-in / Car only) is a segmented control pinned under the
  header on any screen showing totals. Its state persists in the URL and in `profiles`.
- **Bucket chips** are small, outlined, and always carry the bucket colour. On the expense
  form the budget-impact switch sits directly beneath and shows plain-language state:
  "Counts toward August" / "Kept out of August".
- **Empty states** use a Duotone icon at 32px, one sentence of direction, one button.
- **Skeletons**, not spinners. Skeletons are `--paper-sink` with no shimmer.
- **Toasts** appear bottom-centre above the FAB, 2.4s, with an Undo action on every
  destructive or ambiguous write.
- **Touch targets** minimum 44×44. Primary actions in the bottom third of the screen.

### The ledger detail line

A ledger row is two lines in a fixed 64px slot: a title, and under it a detail line set in
`caption`. **The detail line carries structured fields only — bucket, category, vehicle, in
that order — and never free text.** No note, no caption, no merchant blurb, no count.

The reason is that the line truncates rather than wraps, so everything on it competes for the
same handful of characters, and free text always wins that competition by being longer. Put a
note on the line and the note is not what gets cut — the row's own fields are, because they
sit in front of it. Measured on a 390pt viewport with a real dong amount in the right-hand
column, the line has between 82px and 182px to work with, which is roughly thirteen to thirty
characters of Inter Tight at 12px. A one-clause note fills all of it.

Signals that something *exists* but does not fit are carried by a glyph at the end of the
line, not by words:

| Signal | Glyph | Meaning |
|---|---|---|
| The expense has a note | `NoteBlank` | There is a note. Not how long, not what it says. |
| The expense has attachments | `Camera` | There is at least one photo. Not how many. |

Regular weight, 20px (`ICON_UI`), `--text-faint`, always at the end of the line, always in
that order, one glyph per signal no matter how many notes or photos there are. Each carries
screen-reader-only text, because a glyph on its own is not a label. The full note, the whole
set of photos and the count all live in the detail sheet, which is one tap away and has room.

The same rule holds anywhere a fixed-height row summarises a record — the timeline feed, the
service history, the parts list. Structured fields on the line, free text behind the tap.

`npm run measure:ledger` shapes both lines against the built font subsets and reports what
fits at 390pt, so this is a question with an answer rather than an opinion.

## Quality floor

Keyboard focus visible everywhere (`2px solid var(--fire-green)`, `outline-offset: 2px`).
All interactive elements are real buttons or links. Forms are labelled. Images have alt text
derived from context ("Receipt for oil change, 12 March"). Colour never carries meaning
alone — bucket chips have text, states have icons.
