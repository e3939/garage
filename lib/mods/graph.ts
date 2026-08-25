/**
 * Dependency cycles.
 *
 * docs/02-DATA-MODEL.md is explicit that this is a recursive check in the server
 * action rather than a trigger, and the reason is the error message: a
 * constraint can refuse the write, but it cannot say *"Coilovers needs Wheels,
 * and Wheels needs Coilovers"*. The name of the loop is the whole value of the
 * check — without it the user is told no and left to work out why against a
 * board of fifteen cards.
 *
 * Nothing here touches the database. It takes the edge set, the proposed change
 * and the titles, and it is pure, which is why it can be tested.
 */

/** mod id -> the ids it depends on. */
export type DependencyEdges = ReadonlyMap<string, readonly string[]>

/**
 * The first cycle through `modId`, as a path that starts and ends on it —
 * `[a, b, c, a]` — or null when there is none.
 *
 * Depth-first from `modId` along the depends-on direction, tracking the current
 * path. The graph is small (a board is tens of cards, not thousands) so this is
 * a plain recursion with a visited set rather than anything cleverer, and it
 * cannot loop forever even on a graph that is already cyclic.
 */
export function findCycle(modId: string, edges: DependencyEdges): string[] | null {
  const path: string[] = []
  const onPath = new Set<string>()
  const exhausted = new Set<string>()

  function walk(node: string): string[] | null {
    path.push(node)
    onPath.add(node)

    for (const next of edges.get(node) ?? []) {
      if (next === modId) return [...path, modId]
      if (onPath.has(next)) {
        // A loop that does not pass through the node being changed. It was
        // already there; report it from where we found it rather than pretending
        // it starts here.
        const from = path.indexOf(next)
        return [...path.slice(from), next]
      }
      if (exhausted.has(next)) continue
      const found = walk(next)
      if (found) return found
    }

    path.pop()
    onPath.delete(node)
    exhausted.add(node)
    return null
  }

  return walk(modId)
}

/**
 * The edge set as it would be if `modId` depended on exactly `dependsOn`.
 *
 * Checking the proposed graph rather than the stored one is the point: the write
 * has not happened yet, and a check against what is already there would pass
 * every time.
 */
export function withDependencies(
  edges: DependencyEdges,
  modId: string,
  dependsOn: readonly string[],
): DependencyEdges {
  const next = new Map(edges)
  next.set(modId, [...dependsOn])
  return next
}

/**
 * The cycle in words. Takes the path `findCycle` returns, which repeats its
 * first element at the end, and the titles to read it by.
 *
 * "Coilovers needs Wheels, and Wheels needs Coilovers."
 * "Coilovers needs Wheels, Wheels needs Tyres, and Tyres needs Coilovers."
 */
export function describeCycle(
  path: readonly string[],
  titles: ReadonlyMap<string, string>,
): string {
  const name = (id: string) => titles.get(id) ?? 'a mod that is not on this board'

  const steps: string[] = []
  for (let index = 0; index < path.length - 1; index += 1) {
    const from = path[index]
    const to = path[index + 1]
    if (from === undefined || to === undefined) continue
    steps.push(`${name(from)} needs ${name(to)}`)
  }

  if (steps.length === 0) return 'That would make a loop.'
  // One step is a mod pointing at itself. The check constraint refuses that too,
  // but the sentence has to read like a sentence either way.
  if (steps.length === 1) return `${steps[0]}.`

  const last = steps[steps.length - 1]
  return `${steps.slice(0, -1).join(', ')}, and ${last}.`
}

/**
 * The whole check, in one call: null when the dependencies are fine, or a
 * sentence naming the loop when they are not.
 */
export function cycleError(
  modId: string,
  dependsOn: readonly string[],
  edges: DependencyEdges,
  titles: ReadonlyMap<string, string>,
): string | null {
  const cycle = findCycle(modId, withDependencies(edges, modId, dependsOn))
  if (!cycle) return null
  return `That would make a loop: ${describeCycle(cycle, titles)}`
}
