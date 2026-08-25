/**
 * The board draws its own FAB.
 *
 * On every other screen the brick action is "log an expense" and it lives in
 * this slot, which is a sibling of the page. Here it is "add a mod", and the
 * sheet it opens needs the board's own state — the other cards, so a dependency
 * can point at one — which a sibling of the page cannot see. So the slot stands
 * down and `components/mods/mod-board.tsx` renders the same `<Fab>`.
 *
 * Settings does the same thing for the opposite reason: it has no primary
 * action at all.
 */
export default function PlanFabSlot() {
  return null
}
