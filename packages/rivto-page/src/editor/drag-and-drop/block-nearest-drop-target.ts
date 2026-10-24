import type { BlockDropAcceptance, BlockDropIndicator, ResolvedBlockDropTarget } from "./types";

/**
 * Measures squared distance to a viewport rectangle without reading DOM geometry.
 *
 * @param rect - Candidate insertion line or empty receiving area.
 * @param x - Pointer viewport X in CSS pixels.
 * @param y - Pointer viewport Y in CSS pixels.
 * @returns Zero inside the rectangle, otherwise squared Euclidean distance.
 */
export function blockDropDistance(rect: BlockDropIndicator, x: number, y: number): number {
  const dx = Math.max(rect.left - x, 0, x - rect.left - rect.width);
  const dy = Math.max(rect.top - y, 0, y - rect.top - rect.height);
  return dx * dx + dy * dy;
}

/**
 * Chooses the nearest permitted destination using the same geometry as its feedback.
 *
 * Candidate order breaks ties. Permission is synchronous and does not commit a
 * move; the gesture owner still revalidates its final destination on release.
 *
 * @param candidates - Local geometry candidates; missing entries are ignored.
 * @param x - Pointer viewport X in CSS pixels.
 * @param y - Pointer viewport Y in CSS pixels.
 * @param accepts - Optional host permission check; omission accepts geometric candidates.
 * @returns Nearest accepted target, or undefined when no candidate is permitted.
 */
export function nearestBlockDropTarget(
  candidates: readonly (ResolvedBlockDropTarget | undefined)[],
  x: number,
  y: number,
  accepts?: BlockDropAcceptance,
): ResolvedBlockDropTarget | undefined {
  let nearest: ResolvedBlockDropTarget | undefined;
  let distance = Infinity;
  for (const target of candidates) {
    if (!target || (accepts && !accepts(target.destination))) {
      continue;
    }
    const rect = target.indicator ?? target.element.getBoundingClientRect();
    const candidateDistance = blockDropDistance(rect, x, y);
    if (candidateDistance < distance) {
      nearest = target;
      distance = candidateDistance;
    }
  }
  return nearest;
}
