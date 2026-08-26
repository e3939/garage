/**
 * How a screen asks the FAB slot to open the quick-add sheet.
 *
 * The FAB is a parallel route (`app/(app)/@fab`), which makes it a sibling of
 * the page rather than a child of it, so the sheet's open state is not
 * reachable from a component on the page — and an empty state whose one button
 * does nothing is worse than an empty state with no button at all.
 *
 * A window event is the cheapest thing that crosses that boundary. It carries
 * no data, there is exactly one listener, and it costs neither a context
 * provider around the whole shell nor a piece of shared state that every route
 * would then be able to write to.
 */
export const QUICK_ADD_EVENT = 'garage:quick-add'

export function requestQuickAdd(): void {
  window.dispatchEvent(new Event(QUICK_ADD_EVENT))
}
