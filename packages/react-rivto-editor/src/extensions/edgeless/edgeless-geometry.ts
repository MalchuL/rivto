/**
 * Viewport-space geometry helpers for edgeless marquee and pan/zoom math.
 *
 * Hit testing stays in client coordinates so marquee can reuse DOM rects
 * captured once per gesture. Group lifting walks a child→parent map built
 * from persisted group records instead of scanning every element per ID.
 */
/** Rectangle expressed in viewport coordinates. */
export interface EdgelessRect {
  readonly left: number;
  readonly top: number;
  readonly right: number;
  readonly bottom: number;
}

/** Minimal element record needed to build a group parent index. */
export interface GroupParentRecord {
  readonly id: string;
  readonly type: string;
  readonly props: { readonly children?: unknown };
}

/** One canvas object and its viewport rectangle for marquee intersection. */
export interface EdgelessObjectHit {
  readonly id: string;
  readonly rect: EdgelessRect;
}

/**
 * Returns root IDs whose rendered rectangles intersect a selection rectangle.
 *
 * @param roots - Object IDs paired with viewport rectangles.
 * @param selection - Inclusive marquee in the same coordinate space.
 * @returns IDs whose rect overlaps `selection`.
 */
export function rootsInRect(
  roots: readonly EdgelessObjectHit[],
  selection: EdgelessRect,
): string[] {
  return roots.filter(({ rect }) => !(
    rect.right < selection.left ||
    rect.left > selection.right ||
    rect.bottom < selection.top ||
    rect.top > selection.bottom
  )).map(({ id }) => id);
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
    if (element.type !== "group" || !Array.isArray(element.props.children)) continue;
    for (const child of element.props.children) {
      if (typeof child !== "string" || !child || parentByChild.has(child)) continue;
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
  for (let parent = parentByChild.get(current); parent && !seen.has(current); parent = parentByChild.get(current)) {
    seen.add(current);
    current = parent;
  }
  return current;
}

/**
 * Converts a viewport pointer delta to unscaled canvas coordinates.
 *
 * @param delta - Distance in CSS pixels.
 * @param zoom - Current canvas zoom factor.
 * @returns Distance in canvas units.
 */
export function canvasDelta(delta: number, zoom: number): number {
  return delta / Math.max(zoom, 0.01);
}
