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
 * the declared child axis or accepting descendants. The same applies to every
 * place where such a layout is chosen without a direct row hit: the gap
 * before it, the page margin beside it, and its own leading or trailing
 * padding are its outer edges, never an append into the layout. Without that
 * rule the only way to drop between two stacked layouts is the upper half of
 * the second layout's 24px title row.
 *
 * @module
 */
import type {
  HitRect,
  PointerDropCandidate,
  PointerDropHit,
  PointerDropReason,
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
 * Returns the item with the smallest area, or `undefined` when the list is empty.
 *
 * @param items - Candidates to compare.
 * @param areaOf - Area reader used for the sort.
 * @returns The smallest item, keeping the first of any ties.
 */
function smallest<T>(items: readonly T[], areaOf: (item: T) => number): T | undefined {
  return [...items].sort((left, right) => areaOf(left) - areaOf(right))[0];
}

/**
 * Classifies a block chosen by proximity rather than by a direct row hit.
 *
 * A fixed outline reached this way is being approached from outside its
 * fields, so it resolves as chrome (before/after). Any other block is an
 * ordinary nearest-row target.
 *
 * @param candidate - Block chosen by the gap picker.
 * @returns Hit reason consumed by the drop-intent rules.
 */
function proximityReason(candidate: PointerDropCandidate): PointerDropReason {
  return isStructuralLayout(candidate) ? "chrome" : "nearby-row";
}

/**
 * Reports whether the pointer sits in a filled fixed layout's own leading or
 * trailing padding: inside the layout rect, within `edgePx` of its top or
 * bottom edge, outside the vertical span of every direct child, and farther
 * than `edgePx` from every descendant row.
 *
 * That padding is the layout's outer edge. Three exclusions keep existing
 * fields intact:
 *
 * - An empty layout has no padding "outside its children"; its whole body
 *   stays the accepting field a user fills first.
 * - A layout whose parent outline is fixed (a table row between sibling rows)
 *   lives between shells, so its strip under the cells keeps resolving to a
 *   cell field.
 * - A descendant row within `edgePx` still wins, so the wrap gap under a grid
 *   tile remains that tile's sibling gap.
 *
 * @param layout - Smallest measured block containing the pointer.
 * @param candidates - Every measured block, used to find children and the parent.
 * @param pointer - Viewport cursor.
 * @param edgePx - Thickness of the edge band measured from the layout rect.
 * @returns `true` when the pointer is in the layout's own edge padding.
 */
function inLayoutEdgePadding(
  layout: PointerDropCandidate,
  candidates: readonly PointerDropCandidate[],
  pointer: { readonly x: number; readonly y: number },
  edgePx: number,
): boolean {
  if (!isStructuralLayout(layout)) return false;
  const parentId = layout.ancestorIds[0];
  const parent = parentId ? candidates.find((candidate) => candidate.id === parentId) : undefined;
  if (parent && isStructuralLayout(parent)) return false;
  const descendants = candidates.filter((candidate) => candidate.ancestorIds.includes(layout.id));
  const children = descendants.filter((candidate) => candidate.ancestorIds[0] === layout.id);
  if (children.length === 0) return false;
  const { x, y } = pointer;
  const childTop = Math.min(...children.map((child) => child.block.top));
  const childBottom = Math.max(...children.map((child) => child.block.bottom));
  const leading = y <= layout.block.top + edgePx && y < childTop;
  const trailing = y >= layout.block.bottom - edgePx && y > childBottom;
  const rowNearby = descendants.some((candidate) => distanceToRect(x, y, candidate.row) <= edgePx);
  return (leading || trailing) && !rowNearby;
}

/**
 * Chooses the drop target for a viewport pointer.
 *
 * A pointer on a writing row targets that block so "inside" stays on the same
 * line as the row. A fixed outline's title is chrome (outline before/after),
 * and so is any fixed outline reached through a gap, a page margin, or its
 * own leading/trailing padding. A pointer in a gap targets the nearest row.
 * Filled fixed layouts prefer a descendant field, while empty accepting
 * layouts remain full-body targets. Grid space remains an accepting body
 * outside nearby item gaps and edge padding. Space outside the first or last
 * root targets that root's outer edge.
 *
 * @param candidates - Measured blocks in the active surface.
 * @param pointer - Viewport cursor.
 * @param nearbyRowPx - Distance at which a descendant row wins over a free
 * lane; also the thickness of a fixed layout's edge padding band.
 * @returns The chosen block and why it won, or `null` when the surface is empty.
 */
export function pickPointerDropTarget(
  candidates: readonly PointerDropCandidate[],
  pointer: { readonly x: number; readonly y: number },
  nearbyRowPx: number = NEARBY_ROW_DROP_PX,
): PointerDropHit | null {
  const { x, y } = pointer;
  let result: PointerDropHit | null = null;

  const rowHits = candidates.filter((candidate) => pointInRect(x, y, candidate.row));
  const rowHit = smallest(rowHits, (candidate) => rectArea(candidate.row));
  if (rowHit) {
    result = {
      id: rowHit.id,
      reason: isStructuralLayout(rowHit) ? "chrome" : "row",
    };
  } else {
    const roots = candidates.filter((candidate) => candidate.ancestorIds.length === 0);
    const firstRoot = [...roots].sort((left, right) => left.block.top - right.block.top)[0];
    const lastRoot = [...roots].sort((left, right) => right.block.bottom - left.block.bottom)[0];
    const nearest = [...candidates]
      .map((candidate) => ({ candidate, dist: distanceToRect(x, y, candidate.row) }))
      .sort((left, right) => left.dist - right.dist)[0];
    const containers = candidates.filter((candidate) => (
      candidate.acceptsDropContainer && pointInRect(x, y, candidate.block)
    ));
    const container = smallest(containers, (candidate) => rectArea(candidate.block));
    // The enclosing layout is measured independently of acceptance: an
    // unaccepting shell such as Columns still owns its edge padding.
    const enclosing = smallest(
      candidates.filter((candidate) => pointInRect(x, y, candidate.block)),
      (candidate) => rectArea(candidate.block),
    );

    // Prefer a nearby descendant row so a gap between cards or nested outline
    // blocks does not become "inside" the parent lane. An empty lane body has
    // no nearby descendant and keeps the container so inside still works.
    // Fixed layouts skip the distance cap so chrome-adjacent space resolves to
    // a declared field instead of appending an accidental structural child.
    // Page padding and end controls sit outside every BlockView. Resolve that
    // space against the root boundary, not the visually nearest nested lane.
    if (firstRoot && y < firstRoot.block.top) {
      result = { id: firstRoot.id, reason: "root-edge" };
    } else if (lastRoot && y > lastRoot.block.bottom) {
      result = { id: lastRoot.id, reason: "root-edge" };
    } else if (enclosing && inLayoutEdgePadding(enclosing, candidates, pointer, nearbyRowPx)) {
      // The layout's own padding above its first or below its last child is
      // where a user aims to drop before or after the whole layout.
      result = { id: enclosing.id, reason: "chrome" };
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
        ? { id: descendant!.candidate.id, reason: proximityReason(descendant!.candidate) }
        : { id: container.id, reason: "container" };
    } else if (nearest) {
      // A gap or margin next to a fixed layout is that layout's edge; treating
      // its title as a nearby row would append into the layout instead.
      result = { id: nearest.candidate.id, reason: proximityReason(nearest.candidate) };
    }
  }
  return result;
}
