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
body         15     Inter Tight 400, line-height 1.5           Default
label        13     Inter Tight 500                            Field labels
caption      12     Inter Tight 400, --text-muted              Meta
eyebrow      11     Archivo Expanded 600, tracking 0.12em, caps Section markers
odometer-lg  40     JetBrains Mono 700, tabular                 Hero figures
odometer     20     JetBrains Mono 500, tabular                 Row amounts
```

Rule: a screen has at most one `display-lg` and one `odometer-lg`. If a design needs two hero
numbers, one of them isn't a hero.

---

## Shape, depth, grid

- Radius: `--r-sm: 6px`, `--r-md: 10px`, `--r-lg: 14px`, `--r-full: 999px`. Nothing larger —
  the paper metaphor has folds, not pills.
- Spacing scale: 4 / 8 / 12 / 16 / 20 / 24 / 32 / 48. Nothing between.
- Elevation is mostly **rules and tint**, not shadow. One shadow token exists,
  `--shadow-sheet: 0 -8px 32px rgba(42,38,32,0.12)`, used only on bottom sheets and modals.
- Recessed panels (the odometer bed) use `--paper-sink` plus `inset 0 1px 0 var(--rule)`.
- Grid: single column on mobile, 16px gutters. Content max-width 720px on desktop; the app
  stays a column even on a large screen. It is a logbook, not a control room.

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

## Quality floor

Keyboard focus visible everywhere (`2px solid var(--fire-green)`, `outline-offset: 2px`).
All interactive elements are real buttons or links. Forms are labelled. Images have alt text
derived from context ("Receipt for oil change, 12 March"). Colour never carries meaning
alone — bucket chips have text, states have icons.
