import {
  dropBounds,
  dropEdgeRect,
  containsDropPoint,
  dropRegionTarget,
  isDropBackground,
  readDropGeometry,
} from "./block-drop-region-geometry";
import type { BlockDropBounds, BlockDropGeometry } from "./block-drop-region-geometry";
import type {
  BlockDropDestination,
  BlockDropEdgeRegion,
  BlockDropLayoutRegistration,
  BlockDropPoint,
  BlockDropTargetRegistration,
  ResolvedBlockDropTarget,
} from "./types";

/**
 * Finds the first mounted placement starting after a coordinate in monotone flow.
 *
 * @param items - Registered visible anchors in visual flow order.
 * @param coordinate - Viewport coordinate along the declared axis.
 * @param read - Query-local measurement accessor, never retained between events.
 * @param axis - Physical coordinate used for this search.
 * @param from - Inclusive start of a wrapping row, default zero.
 * @param to - Exclusive end, default all mounted anchors.
 * @param rtl - Whether inline coordinates run in decreasing viewport order.
 * @returns Insertion index after anchors whose starting coordinate is at/before the point.
 */
function upperBound(
  items: readonly BlockDropTargetRegistration[],
  coordinate: number,
  read: (item: BlockDropTargetRegistration) => BlockDropGeometry,
  axis: "x" | "y",
  from = 0,
  to = items.length,
  rtl = false,
): number {
  while (from < to) {
    const middle = (from + to) >>> 1;
    const rect = read(items[middle]!).rect;
    const inlineStart = rtl ? -rect.right : rect.left;
    const start = axis === "y" ? rect.top : inlineStart;
    if (start <= coordinate) {
      from = middle + 1;
    } else {
      to = middle;
    }
  }
  return from;
}

/**
 * Locates at most two neighboring pairs without scanning or measuring the entire list.
 *
 * Wrapping layouts require row-major order and aligned row starts. Adjacent rows
 * share a block boundary only where their canonical neighbors overlap horizontally;
 * other inter-row space belongs to the separately declared background.
 *
 * @param layout - Mounted list and explicit axis/gap policy.
 * @param point - Current viewport pointer.
 * @param hit - Native hit, used to restrict gaps to their background or adjacent anchors.
 * @param edge - Nearest declared edge, optionally normalized to its shared boundary.
 * @returns Physical gap target, or undefined for background, virtual holes or absent neighbors.
 */
export function resolveLayoutGap(
  layout: BlockDropLayoutRegistration,
  point: BlockDropPoint,
  hit: Element,
  edge?: ResolvedBlockDropTarget,
): ResolvedBlockDropTarget | undefined {
  if (!layout.gaps || (edge && layout.boundaries === "separate")) {
    return;
  }
  const items = layout.getItems();
  if (!items?.length) {
    return;
  }
  const cache = new Map<BlockDropTargetRegistration, BlockDropGeometry>();
  const read = (item: BlockDropTargetRegistration) => {
    let value = cache.get(item);
    if (!value) {
      value = readDropGeometry(item.element);
      cache.set(item, value);
    }
    return value;
  };
  const rtl =
    layout.element.ownerDocument.defaultView!.getComputedStyle(layout.element).direction === "rtl";
  const pairs = layoutPairIndices(items, layout.axis, point, read, rtl, edge?.region);
  for (const pair of pairs) {
    const previous = items[pair - 1]!;
    const next = items[pair]!;
    // Native hit testing may round a fractional gap point onto an adjacent anchor.
    if (
      !isDropBackground(layout.element, hit, point) &&
      !previous.element.contains(hit) &&
      !next.element.contains(hit)
    ) {
      continue;
    }
    const target = resolvePair(layout, previous, next, point, read, rtl, edge);
    if (target) {
      return target;
    }
  }
}

/**
 * Finds adjacent candidate indices within the pointer's aligned flow row.
 *
 * @param items - Committed mounted anchors in visual order.
 * @param axis - Declared layout flow.
 * @param point - Current viewport pointer.
 * @param read - Query-local geometry accessor.
 * @param rtl - Whether inline flow decreases in viewport coordinates.
 * @param edge - Existing edge restricting the search to its one neighbor.
 * @returns Local pair indices, including adjacent row transitions for wrapping layouts.
 */
function layoutPairIndices(
  items: readonly BlockDropTargetRegistration[],
  axis: BlockDropLayoutRegistration["axis"],
  point: BlockDropPoint,
  read: (item: BlockDropTargetRegistration) => BlockDropGeometry,
  rtl: boolean,
  edge?: ResolvedBlockDropTarget["region"],
): number[] {
  const horizontal = axis !== "vertical";
  let start = 0;
  let end = items.length;
  if (axis === "grid") {
    end = upperBound(items, point.y, read, "y");
    if (!end) {
      return [];
    }
    const top = read(items[end - 1]!).rect.top;
    start = upperBound(items, top - 0.01, read, "y");
  }
  const inlinePoint = rtl ? -point.x : point.x;
  let index = upperBound(
    items,
    horizontal ? inlinePoint : point.y,
    read,
    horizontal ? "x" : "y",
    start,
    end,
    rtl,
  );
  if (edge?.kind === "edge") {
    const sideAxis = horizontal ? "inline" : "block";
    if (axis !== "grid" && !edge.side.startsWith(sideAxis)) {
      return [];
    }
    if (edge.side.endsWith("start")) {
      index -= 1;
    }
  }
  if (axis === "grid") {
    return [...new Set([index, index - 1, start, end])].filter(
      (pair) => pair > 0 && pair < items.length,
    );
  }
  return (edge ? [index] : [index, index - 1]).filter((pair) => pair > start && pair < end);
}

/**
 * Resolves a real gap into the nearer anchor's canonical boundary and physical feedback.
 *
 * @param layout - Gap owner; virtual roots require consecutive display indices.
 * @param previous - Visible preceding anchor, not necessarily a canonical sibling.
 * @param next - Visible following anchor, retaining its own canonical neighbors.
 * @param point - Native viewport position.
 * @param read - Shared query-local geometry reader.
 * @param rtl - Direction of horizontal flow.
 * @param edge - Already selected local edge; only its matching pair can normalize feedback.
 * @returns Target on the chosen side, or undefined for overlap, missing edges or virtual holes.
 */
function resolvePair(
  layout: BlockDropLayoutRegistration,
  previous: BlockDropTargetRegistration,
  next: BlockDropTargetRegistration,
  point: BlockDropPoint,
  read: (item: BlockDropTargetRegistration) => BlockDropGeometry,
  rtl: boolean,
  edge?: ResolvedBlockDropTarget,
): ResolvedBlockDropTarget | undefined {
  if (layout.virtual && !hasConsecutiveIndices(previous.element, next.element)) {
    return;
  }
  const a = read(previous).rect;
  const b = read(next).rect;
  const horizontal = layout.axis === "horizontal" || (layout.axis === "grid" && a.top === b.top);
  const rect = pairBounds(a, b, horizontal, rtl);
  const low = horizontal ? rect.left : rect.top;
  const high = horizontal ? rect.right : rect.bottom;
  if (high < low) {
    return;
  }
  if (edge) {
    const region = edge.region;
    const sideAxis = horizontal ? "inline" : "block";
    if (region?.kind !== "edge" || !region.side.startsWith(sideAxis)) {
      return;
    }
    const owner = region.side.endsWith("end") ? previous : next;
    if (owner.element !== edge.element || !owner.getRegions().includes(region)) {
      return;
    }
    if ((horizontal ? rect.height : rect.width) <= 0) {
      return;
    }
  } else if (
    !containsDropPoint(rect, point) &&
    !containsPairEdge(previous, next, horizontal, read, point)
  ) {
    return;
  }
  const coordinate = horizontal ? point.x : point.y;
  const preceding =
    horizontal && rtl ? coordinate >= (low + high) / 2 : coordinate <= (low + high) / 2;
  const entry = preceding ? previous : next;
  const side = `${horizontal ? "inline" : "block"}-${preceding ? "end" : "start"}`;
  const target = edge ?? edgeTarget(entry, side, read, point);
  if (!target) {
    return;
  }
  const merged = mergedTarget(layout, previous, next, point, read, (low + high) / 2, horizontal);
  if (edge && !merged) {
    return;
  }
  return {
    ...(merged ?? target),
    region: { kind: "gap", previous, next, axis: horizontal ? "horizontal" : "vertical" },
  };
}

/**
 * Resolves one shared depth choice when the two declarations describe the same sibling boundary.
 *
 * The preceding trailing declaration supplies depth bands across both edges and
 * the physical gap, so changing only Y cannot switch between sibling and inside.
 *
 * @param layout - Owner of the explicit feedback mode and flow axis.
 * @param previous - Mounted preceding anchor.
 * @param next - Mounted following anchor.
 * @param point - Pointer selecting any declared outline depth bands.
 * @param read - Query-local measurements shared with the gap search.
 * @param middle - Viewport midpoint of the physical interval.
 * @param horizontal - Whether this pair shares inline edges; wrapped row transitions use block edges.
 * @returns Shared target and line, or undefined for separate mode or distinct canonical boundaries.
 */
function mergedTarget(
  layout: BlockDropLayoutRegistration,
  previous: BlockDropTargetRegistration,
  next: BlockDropTargetRegistration,
  point: BlockDropPoint,
  read: (item: BlockDropTargetRegistration) => BlockDropGeometry,
  middle: number,
  horizontal: boolean,
) {
  if (layout.boundaries === "separate") {
    return;
  }
  const axis = horizontal ? "inline" : "block";
  const before = previous
    .getRegions()
    .find((region) => region.kind === "edge" && region.side === `${axis}-end`);
  const after = next
    .getRegions()
    .find((region) => region.kind === "edge" && region.side === `${axis}-start`);
  if (!before || !after || !sameSiblingBoundary(before.destination, after.destination)) {
    return;
  }
  const target = dropRegionTarget(previous, before, read(previous), point);
  if (!target.indicator) {
    return;
  }
  const indicator =
    axis === "block"
      ? { ...target.indicator, top: middle - 1 }
      : {
          ...target.indicator,
          left: middle - 1,
          top: Math.min(read(previous).rect.top, read(next).rect.top),
          height:
            Math.max(read(previous).rect.bottom, read(next).rect.bottom) -
            Math.min(read(previous).rect.top, read(next).rect.top),
        };
  return { ...target, indicator };
}

/**
 * Measures the physical interval shared by two neighboring border boxes.
 *
 * @param a - Preceding anchor bounds.
 * @param b - Following anchor bounds.
 * @param horizontal - Whether insertion progresses along the inline axis.
 * @param rtl - Whether horizontal order runs right to left.
 * @returns Gap bounds using the intersection on the cross axis; overlaps have negative size.
 */
function pairBounds(a: BlockDropBounds, b: BlockDropBounds, horizontal: boolean, rtl: boolean) {
  if (horizontal) {
    const left = rtl ? b.right : a.right;
    const right = rtl ? a.left : b.left;
    const top = Math.max(a.top, b.top);
    return dropBounds(left, top, right - left, Math.min(a.bottom, b.bottom) - top);
  }
  const left = Math.max(a.left, b.left);
  return dropBounds(left, a.bottom, Math.min(a.right, b.right) - left, b.top - a.bottom);
}

/**
 * Resolves an anchor's declared logical edge at the current outline depth.
 *
 * @param entry - Mounted anchor with live declarations.
 * @param side - Logical edge selected by the containing layout.
 * @param read - Query-local geometry accessor.
 * @param point - Pointer selecting any declared depth band.
 * @returns Declared target, or undefined when that edge is absent.
 */
function edgeTarget(
  entry: BlockDropTargetRegistration,
  side: string,
  read: (item: BlockDropTargetRegistration) => BlockDropGeometry,
  point: BlockDropPoint,
) {
  const region = entry
    .getRegions()
    .find(
      (region): region is BlockDropEdgeRegion => region.kind === "edge" && region.side === side,
    );
  return region ? dropRegionTarget(entry, region, read(entry), point) : undefined;
}

/**
 * Checks that a virtual pair has no unmounted display positions between its anchors.
 *
 * @param previous - Mounted preceding anchor under an indexed root.
 * @param next - Mounted following anchor under an indexed root.
 * @returns True only when both display indices exist and the second immediately follows the first.
 */
function hasConsecutiveIndices(previous: HTMLElement, next: HTMLElement): boolean {
  const a = previous.closest("[data-index]")?.getAttribute("data-index");
  const b = next.closest("[data-index]")?.getAttribute("data-index");
  return a != null && b != null && Number(b) === Number(a) + 1;
}

/**
 * Recognizes the two declarations of one canonical sibling boundary before depth selection.
 *
 * @param before - Destination declared by the preceding trailing edge.
 * @param after - Destination declared by the following leading edge.
 * @returns True only for the same actual parent and both canonical neighbors.
 */
function sameSiblingBoundary(before: BlockDropDestination, after: BlockDropDestination): boolean {
  return (
    before.kind === "between" &&
    after.kind === "between" &&
    before.parentId === after.parentId &&
    before.previousId === after.previousId &&
    before.nextId === after.nextId
  );
}

/**
 * Covers declared neighboring inset edges when native hit rounding crosses their seam.
 *
 * @param previous - Preceding mounted anchor.
 * @param next - Following mounted anchor.
 * @param horizontal - Whether the boundary uses inline edges.
 * @param read - Query-local geometry accessor.
 * @param point - Exact viewport pointer, independent of rounded native ownership.
 * @returns True within either declared inset edge; no geometry is expanded.
 */
function containsPairEdge(
  previous: BlockDropTargetRegistration,
  next: BlockDropTargetRegistration,
  horizontal: boolean,
  read: (item: BlockDropTargetRegistration) => BlockDropGeometry,
  point: BlockDropPoint,
): boolean {
  const axis = horizontal ? "inline" : "block";
  return [previous, next].some((entry, index) => {
    const side = `${axis}-${index === 0 ? "end" : "start"}`;
    const region = entry
      .getRegions()
      .find((region) => region.kind === "edge" && region.side === side);
    return (
      region?.kind === "edge" &&
      containsDropPoint(
        region.coverage === "bounds" ? read(entry).rect : dropEdgeRect(region, read(entry)),
        point,
      )
    );
  });
}
