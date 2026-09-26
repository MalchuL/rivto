/**
 * Pointer hit-testing for page-surface block drops.
 *
 * A gap between rows must resolve to the nearest block, not the nearest
 * accepting ancestor. "Inside" uses the same rule: the
 * pointer has to sit on that block's row, or on an empty container body when
 * no descendant row is nearby. First and last nested rows still participate
 * through ordinary nearest-row distance, so a gap above the first child or
 * below the last child does not jump to a parent board.
 *
 * Fixed child outlines are different: their title row is outline chrome, not
 * a drop field. Hovering that title or its adjacent strip must resolve through
 * the declared child axis or accepting descendants.
 *
 * @module
 */
import type {
  HitRect,
  PointerDropCandidate,
  PointerDropHit,
} from "./types";
import { isStructuralLayout } from "../placement/intent";

export type {
  HitRect,
  PointerDropCandidate,
  PointerDropHit,
  PointerDropReason,
} from "./types";

/**
 * Distance at which a descendant row wins over its containing lane.
 *
 * Typical outline gaps are 8–16px. Empty columns are much taller, so their
 * body stays a container target instead of snapping to the lane header.
 */
export const NEARBY_ROW_DROP_PX = 24;

/**
 * Reports whether a viewport point lies inside a rectangle, edges included.
 *
 * @param x - Viewport X.
 * @param y - Viewport Y.
 * @param rect - Rectangle to test.
 * @returns `true` when the point is inside or on the boundary.
 */
function pointInRect(x: number, y: number, rect: HitRect): boolean {
  return x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom;
}

/**
 * Returns the area of a rectangle, treating inverted edges as empty.
 *
 * @param rect - Rectangle to measure.
 * @returns Non-negative width × height.
 */
function rectArea(rect: HitRect): number {
  return Math.max(0, rect.right - rect.left) * Math.max(0, rect.bottom - rect.top);
}

/**
 * Returns the distance from a point to the nearest edge of a rectangle.
 *
 * A point already inside the rectangle has distance zero. Used so a gap
 * prefers the closest row rather than the closest container center.
 *
 * @param x - Viewport X.
 * @param y - Viewport Y.
 * @param rect - Rectangle to measure against.
 * @returns Euclidean distance to the rectangle, or `0` when inside.
 */
function distanceToRect(x: number, y: number, rect: HitRect): number {
  const dx = x < rect.left ? rect.left - x : x > rect.right ? x - rect.right : 0;
  const dy = y < rect.top ? rect.top - y : y > rect.bottom ? y - rect.bottom : 0;
  return Math.hypot(dx, dy);
}

/**
 * Returns the item with the lowest value from the supplied measure.
 *
 * @param items - Candidates to compare.
 * @param measure - Numeric value used to compare candidates.
 * @returns The lowest-valued item, keeping the first of any ties, or `undefined`.
 */
function findMinimumBy<T>(items: readonly T[], measure: (item: T) => number): T | undefined {
  return [...items].sort((left, right) => measure(left) - measure(right))[0];
}

/**
 * Chooses the drop target for a viewport pointer.
 *
 * A pointer on a writing row targets that block so "inside" stays on the same
 * line as the row. A fixed outline's title is chrome (outline before/after).
 * A pointer in a gap targets the nearest row. Filled fixed layouts prefer a
 * descendant field, while empty accepting layouts remain full-body targets.
 * Grid space remains an accepting body outside nearby item gaps. Space outside
 * the first or last root targets that root's outer edge.
 *
 * @param candidates - Measured blocks in the active surface.
 * @param pointer - Viewport cursor.
 * @param nearbyRowPx - Distance at which a descendant row wins over a free lane.
 * @param outerEdgeDropZone - Viewport pixels reserved at each block's outer edge; defaults to 8.
 * @returns The chosen block and why it won, or `null` when the surface is empty.
 */
export function pickPointerDropTarget(
  candidates: readonly PointerDropCandidate[],
  pointer: { readonly x: number; readonly y: number },
  nearbyRowPx: number = NEARBY_ROW_DROP_PX,
  outerEdgeDropZone = 8,
): PointerDropHit | null {
  const { x, y } = pointer;
  let result: PointerDropHit | null = null;
  const roots = candidates.filter((candidate) => candidate.ancestorIds.length === 0);
  // An ancestor's outer edge wins over descendant rows occupying the same
  // pixels. Prefer the shallowest matching block when their edges coincide.
  const outerEdge = findMinimumBy(candidates.filter((candidate) => (
    pointInRect(x, y, candidate.block)
    && (y - candidate.block.top <= outerEdgeDropZone
      || candidate.block.bottom - y <= outerEdgeDropZone)
  )), (candidate) => candidate.ancestorIds.length);

  const rowHits = candidates.filter((candidate) => pointInRect(x, y, candidate.row));
  const rowHit = findMinimumBy(rowHits, (candidate) => rectArea(candidate.row));
  if (outerEdge) {
    result = { id: outerEdge.id, reason: "outer-edge" };
  } else if (rowHit) {
    result = {
      id: rowHit.id,
      reason: isStructuralLayout(rowHit) ? "chrome" : "row",
    };
  } else {
    const firstRoot = [...roots].sort((left, right) => left.block.top - right.block.top)[0];
    const lastRoot = [...roots].sort((left, right) => right.block.bottom - left.block.bottom)[0];
    const nearest = [...candidates]
      .map((candidate) => ({ candidate, dist: distanceToRect(x, y, candidate.row) }))
      .sort((left, right) => left.dist - right.dist)[0];
    const containers = candidates.filter((candidate) => (
      candidate.acceptsDropContainer && pointInRect(x, y, candidate.block)
    ));
    const container = findMinimumBy(containers, (candidate) => rectArea(candidate.block));

    // Prefer a nearby descendant row so a gap between cards or nested outline
    // blocks does not become "inside" the parent lane. An empty lane body has
    // no nearby descendant and keeps the container so inside still works.
    // Fixed layouts skip the distance cap so chrome-adjacent space resolves to
    // a declared field instead of appending an accidental structural child.
    // Page padding and end controls sit outside every BlockView. Resolve that
    // space against the root boundary, not the visually nearest nested lane.
    if (firstRoot && y < firstRoot.block.top) {
      result = { id: firstRoot.id, reason: "outer-edge" };
    } else if (lastRoot && y > lastRoot.block.bottom) {
      result = { id: lastRoot.id, reason: "outer-edge" };
    } else if (container) {
      const descendant = [...candidates]
        .filter((candidate) => candidate.ancestorIds.includes(container.id))
        .map((candidate) => ({
          candidate,
          dist: distanceToRect(x, y, candidate.row),
          area: rectArea(candidate.row),
        }))
        .sort((left, right) => left.dist - right.dist || left.area - right.area)[0];
      const preferField = Boolean(descendant) && (
        descendant!.dist <= nearbyRowPx
        || (isStructuralLayout(container) && container.dropAxis !== "grid")
      );
      result = preferField
        ? { id: descendant!.candidate.id, reason: "nearby-row" }
        : { id: container.id, reason: "container" };
    } else if (nearest) {
      result = { id: nearest.candidate.id, reason: "nearby-row" };
    }
  }
  return result;
}
