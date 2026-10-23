/**
 * Persisted group-parent lifting for host edgeless selection.
 *
 * Group lifting walks a child→parent map built
 * from persisted group records instead of scanning every element per ID.
 */
/** Minimal element record needed to build a group parent index. */
export interface GroupParentRecord {
  readonly id: string;
  readonly type: string;
  readonly childIds: readonly string[];
}

/**
 * Builds a child ID → owning group ID map from persisted elements.
 *
 * Each child keeps the first group that lists it. Nested groups are represented
 * by a child group ID pointing at its parent group.
 *
 * @param elements - Current first-class canvas elements.
 * @returns Map of child ID to immediate group parent ID.
 */
export function groupParentByChild(elements: readonly GroupParentRecord[]): Map<string, string> {
  const parentByChild = new Map<string, string>();
  for (const element of elements) {
    if (element.type !== "group" || !Array.isArray(element.childIds)) {
      continue;
    }
    for (const child of element.childIds) {
      if (typeof child !== "string" || !child || parentByChild.has(child)) {
        continue;
      }
      parentByChild.set(child, element.id);
    }
  }
  return parentByChild;
}

/**
 * Walks group parents until the outermost group, or returns `id` if ungrouped.
 *
 * @param id - Hit object ID.
 * @param parentByChild - Child → group parent index from `groupParentByChild`.
 * @returns Outermost group ID that contains `id`, or `id` itself.
 */
export function outermostGroupId(id: string, parentByChild: ReadonlyMap<string, string>): string {
  const seen = new Set<string>();
  let current = id;
  for (
    let parent = parentByChild.get(current);
    parent && !seen.has(current);
    parent = parentByChild.get(current)
  ) {
    seen.add(current);
    current = parent;
  }
  return current;
}
