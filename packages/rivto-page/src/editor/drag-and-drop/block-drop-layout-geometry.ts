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
 * @throws If a measured edge thickness or numeric gutter extent is negative or nonfinite.
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
  const outer = !edge && resolveListEndGap(layout, items, point, hit, read);
  if (outer) {
    return outer;
  }
  const rtl =
    layout.element.ownerDocument.defaultView!.getComputedStyle(layout.element).direction === "rtl";
  const pair = resolveGapPairs(layout, items, point, hit, read, rtl, edge);
  if (pair || edge) {
    return pair;
  }
  const gutter = resolveLayoutGutter(layout, items, point, hit, read, rtl);
  return gutter
    ? (resolveGapPairs(layout, items, point, hit, read, rtl, gutter) ?? gutter)
    : undefined;
}

/**
 * Resolves physical neighbor seams before inferred surrounding-item regions.
 *
 * The same lookup can normalize an inferred edge to its declared shared boundary.
 * Query-local measurements are reused across both passes; no global scan is added.
 *
 * @param layout - Registered layout and feedback policy.
 * @param items - Mounted canonical anchors in flow order.
 * @param point - Native viewport pointer.
 * @param hit - Native visible element restricting occupied and excluded regions.
 * @param read - Shared cached geometry reader.
 * @param rtl - Whether inline order runs right to left.
 * @param edge - Optional edge to normalize against its own canonical neighbor.
 * @returns Matching physical/shared gap, or undefined for an unrelated boundary.
 */
function resolveGapPairs(
  layout: BlockDropLayoutRegistration,
  items: readonly BlockDropTargetRegistration[],
  point: BlockDropPoint,
  hit: Element,
  read: (item: BlockDropTargetRegistration) => BlockDropGeometry,
  rtl: boolean,
  edge?: ResolvedBlockDropTarget,
): ResolvedBlockDropTarget | undefined {
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
  const [start, end] = layoutRowRange(items, axis, point, read);
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
  const host = layout.axis === "grid" ? undefined : layout.element.getBoundingClientRect();
  const rect = pairBounds(a, b, horizontal, rtl, host);
  const low = horizontal ? rect.left : rect.top;
  const high = horizontal ? rect.right : rect.bottom;
  if (high < low) {
    return;
  }
  if (edge) {
    if (!isPairEdge(edge, previous, next, horizontal, rect)) {
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
 * @param host - Registered linear layout bounds; omitted for grid intersections.
 * @returns Gap bounds using the host cross axis for linear lists or the item intersection for grids; overlaps have negative size.
 */
function pairBounds(
  a: BlockDropBounds,
  b: BlockDropBounds,
  horizontal: boolean,
  rtl: boolean,
  host?: BlockDropBounds,
) {
  if (horizontal) {
    const left = rtl ? b.right : a.right;
    const right = rtl ? a.left : b.left;
    const top = host?.top ?? Math.max(a.top, b.top);
    const bottom = host?.bottom ?? Math.min(a.bottom, b.bottom);
    return dropBounds(left, top, right - left, bottom - top);
  }
  const left = host?.left ?? Math.max(a.left, b.left);
  const right = host?.right ?? Math.min(a.right, b.right);
  return dropBounds(left, a.bottom, right - left, b.top - a.bottom);
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

/**
 * Extends declared vertical-list edges through existing free space before/after the list.
 *
 * Explicit child targets retain priority. Only complete mounted endpoints are
 * eligible: virtual holes never become insertion areas. Feedback and canonical
 * neighbors come from the endpoint's existing declaration, with trailing child
 * indentation disabled because this free area inserts at the containing list level.
 * Default row continuation includes vertical child-list endpoints as well as roots;
 * numeric and disabled gutters retain their explicit distance policy.
 * No padding mode, CSS measurement policy or synthetic anchor is required.
 *
 * @param layout - Existing vertical list host with registered anchors and continuation policy.
 * @param items - Committed anchors in display order, already known to be nonempty.
 * @param point - Actual viewport pointer; native hit rounding does not change it.
 * @param hit - Native hit used to exclude occupied or unrelated child chrome.
 * @param read - Query-local geometry accessor shared with ordinary sibling gaps.
 * @returns Endpoint insertion, or undefined outside free space or at virtual holes.
 */
function resolveListEndGap(
  layout: BlockDropLayoutRegistration,
  items: readonly BlockDropTargetRegistration[],
  point: BlockDropPoint,
  hit: Element,
  read: (item: BlockDropTargetRegistration) => BlockDropGeometry,
): ResolvedBlockDropTarget | undefined {
  if (layout.axis !== "vertical" || (layout.gutterSize ?? "row") !== "row") {
    return;
  }
  if (!containsDropPoint(layout.element.getBoundingClientRect(), point)) {
    return;
  }
  const first = items[0]!;
  const last = items[items.length - 1]!;
  let entry: BlockDropTargetRegistration;
  let side: "block-start" | "block-end";
  if (point.y < read(first).rect.top) {
    if (
      layout.virtual &&
      first.element.closest("[data-index]")?.getAttribute("data-index") !== "0"
    ) {
      return;
    }
    entry = first;
    side = "block-start";
  } else if (point.y > read(last).rect.bottom) {
    if (
      layout.virtual &&
      !last.element.closest("[data-index]")?.hasAttribute("data-virtual-last")
    ) {
      return;
    }
    entry = last;
    side = "block-end";
  } else {
    return;
  }
  if (!isDropBackground(layout.element, hit, point) && !entry.element.contains(hit)) {
    return;
  }
  const region = entry
    .getRegions()
    .find((region) => region.kind === "edge" && region.side === side);
  return region?.kind === "edge"
    ? dropRegionTarget(entry, { ...region, depth: undefined }, read(entry), point)
    : undefined;
}

/**
 * Selects declared insertion edges around items or across their legacy row gutters.
 *
 * A zero gutter size leaves free row space for declared background regions.
 * Numeric extents expand all four sides in local CSS pixels, respecting viewport scale.
 * Only the owning layout's visible background participates. Binary searches
 * select local neighboring anchors; unmounted intervals add no edge target. The leading
 * half chooses before and the trailing half after, including horizontal RTL flow.
 * The original region and actual pointer retain outline depth choices. Feedback
 * stays on the block edge and can still merge with its sibling's matching edge.
 * The legacy row mode uses exposed first/last tiles only. Numeric regions also
 * cover exposed top/bottom edges, including below short tiles, within the extent.
 * Physical seams keep priority; farther background retains its own declaration.
 *
 * @param layout - Registered list bounding the row gutters in its declared flow.
 * @param items - Committed mounted anchors in display order.
 * @param point - Actual viewport pointer, also used for outline depth selection.
 * @param hit - Native visible hit; occupied/excluded background is not redirected.
 * @param read - Query-local geometry shared with sibling-gap resolution.
 * @param rtl - Whether horizontal item order decreases in viewport X.
 * @returns Existing edge target, or undefined outside a row or for a missing/disabled edge.
 * @throws If a declared edge size or numeric gutter extent is negative or nonfinite.
 */
function resolveLayoutGutter(
  layout: BlockDropLayoutRegistration,
  items: readonly BlockDropTargetRegistration[],
  point: BlockDropPoint,
  hit: Element,
  read: (item: BlockDropTargetRegistration) => BlockDropGeometry,
  rtl: boolean,
): ResolvedBlockDropTarget | undefined {
  const size = layout.gutterSize ?? "row";
  if (size === 0) {
    return;
  }
  if (size !== "row" && (!Number.isFinite(size) || size < 0)) {
    throw new Error("Gutter size must be finite and nonnegative");
  }
  if (
    !isDropBackground(layout.element, hit, point) ||
    !containsDropPoint(layout.element.getBoundingClientRect(), point)
  ) {
    return;
  }
  if (size !== "row") {
    return sizedGutterTarget(layout, items, point, read, rtl, size);
  }
  const entry = layoutGutterItem(layout.axis, items, point, read, rtl);
  const geometry = entry ? read(entry) : undefined;
  if (!entry || !geometry) {
    return;
  }
  const horizontal = layout.axis === "horizontal";
  const coordinate = horizontal ? point.x : point.y;
  const start = horizontal ? geometry.rect.left : geometry.rect.top;
  const end = horizontal ? geometry.rect.right : geometry.rect.bottom;
  if (containsDropPoint(geometry.rect, point) || coordinate < start || coordinate > end) {
    return;
  }
  const axis = layout.axis === "grid" ? "vertical" : layout.axis;
  return gutterTarget(entry, axis, geometry, point, rtl);
}

/**
 * Selects a declared edge within the numeric extent on any side of local flow neighbors.
 *
 * Candidate lookup uses adjacent rows and anchors, not a global nearest-block scan.
 * Virtual holes retain their old restriction: only cross-axis continuation is inferred;
 * their real endpoint and consecutive-neighbor gaps remain owned by existing declarations.
 *
 * @param layout - Current flow and virtual-hole policy.
 * @param items - Mounted canonical anchors in flow order.
 * @param point - Native viewport pointer on unoccupied host background.
 * @param read - Query-local cached geometry reader.
 * @param rtl - Whether inline flow runs right to left.
 * @param size - Finite positive expansion in local CSS pixels.
 * @returns Closest eligible local edge, or undefined beyond the extent or without an edge.
 */
function sizedGutterTarget(
  layout: BlockDropLayoutRegistration,
  items: readonly BlockDropTargetRegistration[],
  point: BlockDropPoint,
  read: (item: BlockDropTargetRegistration) => BlockDropGeometry,
  rtl: boolean,
  size: number,
): ResolvedBlockDropTarget | undefined {
  let selected: ResolvedBlockDropTarget | undefined;
  let distance = Infinity;
  for (const index of gutterCandidates(items, layout.axis, point, read, rtl)) {
    const entry = items[index]!;
    const geometry = read(entry);
    const { rect } = geometry;
    if (containsDropPoint(rect, point)) {
      continue;
    }
    const horizontal = layout.axis === "horizontal";
    const cursor = horizontal ? point.x : point.y;
    const start = horizontal ? rect.left : rect.top;
    const end = horizontal ? rect.right : rect.bottom;
    if (layout.virtual && (cursor < start || cursor > end)) {
      continue;
    }
    const candidateDistance = gutterDistance(geometry, point);
    if (candidateDistance > size || candidateDistance >= distance) {
      continue;
    }
    const target = gutterTarget(entry, layout.axis, geometry, point, rtl);
    if (target) {
      selected = target;
      distance = candidateDistance;
    }
  }
  return selected;
}

/**
 * Finds a bounded set of nearby anchors with binary searches over local flow rows.
 *
 * Grid lookup includes the containing row and its immediate neighbors, so exposed
 * space above/below a tile does not require measuring the whole layout. Ties retain
 * canonical candidate order; omitted/unmounted anchors are never reconstructed.
 *
 * @param items - Mounted anchors in aligned row-major or linear order.
 * @param axis - Declared flow axis.
 * @param point - Native viewport pointer.
 * @param read - Query-local cached geometry reader.
 * @param rtl - Whether inline order decreases in viewport X.
 * @returns Up to two anchors per neighboring row, or two for a linear list.
 */
function gutterCandidates(
  items: readonly BlockDropTargetRegistration[],
  axis: BlockDropLayoutRegistration["axis"],
  point: BlockDropPoint,
  read: (item: BlockDropTargetRegistration) => BlockDropGeometry,
  rtl: boolean,
): number[] {
  const ranges: Array<readonly [number, number]> = [];
  if (axis === "grid") {
    const end = upperBound(items, point.y, read, "y");
    if (end > 0) {
      const current = layoutRowRange(items, axis, point, read);
      if (current[0] > 0) {
        const y = read(items[current[0] - 1]!).rect.top;
        ranges.push(layoutRowRange(items, axis, { ...point, y }, read));
      }
      ranges.push(current);
    }
    if (end < items.length) {
      const y = read(items[end]!).rect.top;
      ranges.push(layoutRowRange(items, axis, { ...point, y }, read));
    }
  } else {
    ranges.push([0, items.length]);
  }
  const candidates: number[] = [];
  const horizontal = axis !== "vertical";
  const inlinePoint = rtl ? -point.x : point.x;
  const coordinate = horizontal ? inlinePoint : point.y;
  for (const [start, end] of ranges) {
    const index = upperBound(items, coordinate, read, horizontal ? "x" : "y", start, end, rtl);
    for (const candidate of [index - 1, index]) {
      if (candidate >= start && candidate < end) {
        candidates.push(candidate);
      }
    }
  }
  return candidates;
}

/**
 * Measures distance to the expanded item rectangle in unscaled local CSS pixels.
 *
 * @param geometry - Existing bounds and local-to-viewport scale on both axes.
 * @param point - Native viewport pointer outside or inside the item.
 * @returns Zero inside; otherwise the greater outside-axis distance, including corners.
 */
function gutterDistance(
  { rect, scaleX, scaleY }: BlockDropGeometry,
  point: BlockDropPoint,
): number {
  const x = Math.max(rect.left - point.x, point.x - rect.right, 0) / scaleX;
  const y = Math.max(rect.top - point.y, point.y - rect.bottom, 0) / scaleY;
  return Math.max(x, y);
}

/**
 * Resolves an item's declared before/after edge using its existing outline-depth choices.
 *
 * @param entry - Mounted anchor and live canonical declarations.
 * @param axis - Surrounding flow; grid uses the exposed physical side, with block edges winning corners.
 * @param geometry - Query-local item bounds and computed tokens.
 * @param point - Pointer selecting the before/after half and any nesting depth.
 * @param rtl - Whether horizontal before/after and grid inline edges run right to left.
 * @returns Existing edge target, or undefined when the requested edge is missing or disabled.
 * @throws If the declared edge size is negative or nonfinite.
 */
function gutterTarget(
  entry: BlockDropTargetRegistration,
  axis: BlockDropLayoutRegistration["axis"],
  geometry: BlockDropGeometry,
  point: BlockDropPoint,
  rtl: boolean,
): ResolvedBlockDropTarget | undefined {
  const horizontal = axis === "horizontal";
  const cursor = horizontal ? point.x : point.y;
  const start = horizontal ? geometry.rect.left : geometry.rect.top;
  const end = horizontal ? geometry.rect.right : geometry.rect.bottom;
  const after = horizontal && rtl ? cursor < (start + end) / 2 : cursor >= (start + end) / 2;
  let side: BlockDropEdgeRegion["side"] = `${horizontal ? "inline" : "block"}-${after ? "end" : "start"}`;
  if (axis === "grid") {
    const { rect } = geometry;
    if (point.y < rect.top || point.y > rect.bottom) {
      side = point.y < rect.top ? "block-start" : "block-end";
    } else {
      side = point.x < rect.left !== rtl ? "inline-start" : "inline-end";
    }
  }
  const region = entry
    .getRegions()
    .find(
      (region): region is BlockDropEdgeRegion => region.kind === "edge" && region.side === side,
    );
  if (!region) {
    return;
  }
  const strip = dropEdgeRect(region, geometry);
  return strip.width > 0 && strip.height > 0
    ? dropRegionTarget(entry, region, geometry, point)
    : undefined;
}

/**
 * Checks that an edge is still declared by the matching member of a sibling pair.
 *
 * Registration identity is retained: a foreign or stale descriptor cannot borrow
 * another pair's midpoint or switch its logical axis during normalization.
 *
 * @param edge - Selected anchor and original declaration.
 * @param previous - Mounted preceding sibling registration.
 * @param next - Mounted following sibling registration.
 * @param horizontal - Whether the pair uses inline rather than block edges.
 * @param bounds - Physical pair interval; a nonpositive cross axis cannot normalize feedback.
 * @returns True for that pair's current declaration on the corresponding side.
 */
function isPairEdge(
  edge: Pick<ResolvedBlockDropTarget, "element" | "region">,
  previous: BlockDropTargetRegistration,
  next: BlockDropTargetRegistration,
  horizontal: boolean,
  bounds: BlockDropBounds,
): boolean {
  if ((horizontal ? bounds.height : bounds.width) <= 0) {
    return false;
  }
  const region = edge.region;
  if (region?.kind !== "edge" || !region.side.startsWith(horizontal ? "inline" : "block")) {
    return false;
  }
  const owner = region.side.endsWith("end") ? previous : next;
  return owner.element === edge.element && owner.getRegions().includes(region);
}

/**
 * Finds the mounted item whose exposed gutter contains the pointer's flow coordinate.
 *
 * Wrapping rows expose gutters only outside their first and last tiles. Space
 * between tiles remains a canonical seam, and space under a short tile stays background.
 *
 * @param axis - Declared flow axis of the owning layout.
 * @param items - Committed anchors in visual order.
 * @param point - Current viewport pointer.
 * @param read - Query-local cached geometry reader.
 * @param rtl - Whether inline order runs right to left.
 * @returns One candidate, or undefined before all items or inside a grid row's span.
 */
function layoutGutterItem(
  axis: BlockDropLayoutRegistration["axis"],
  items: readonly BlockDropTargetRegistration[],
  point: BlockDropPoint,
  read: (item: BlockDropTargetRegistration) => BlockDropGeometry,
  rtl: boolean,
): BlockDropTargetRegistration | undefined {
  if (axis === "grid") {
    const [start, end] = layoutRowRange(items, axis, point, read);
    if (start === end) {
      return;
    }
    const first = items[rtl ? end - 1 : start]!;
    const last = items[rtl ? start : end - 1]!;
    if (point.x < read(first).rect.left) {
      return first;
    }
    if (point.x > read(last).rect.right) {
      return last;
    }
    return;
  }
  const horizontal = axis === "horizontal";
  let coordinate = horizontal ? point.x : point.y;
  if (horizontal && rtl) {
    coordinate = -coordinate;
  }
  return items[
    upperBound(items, coordinate, read, horizontal ? "x" : "y", 0, items.length, rtl) - 1
  ];
}

/**
 * Bounds binary searches to the aligned wrapping row containing the pointer.
 *
 * Linear lists retain their complete committed range. Grid items must be in
 * row-major order with aligned row starts, as required by physical gap lookup.
 *
 * @param items - Committed mounted anchors in visual order.
 * @param axis - Declared linear or grid flow.
 * @param point - Pointer selecting the wrapping row by viewport Y.
 * @param read - Query-local cached geometry reader.
 * @returns Half-open row indices, or an empty range before the first grid row.
 */
function layoutRowRange(
  items: readonly BlockDropTargetRegistration[],
  axis: BlockDropLayoutRegistration["axis"],
  point: BlockDropPoint,
  read: (item: BlockDropTargetRegistration) => BlockDropGeometry,
): readonly [number, number] {
  if (axis !== "grid") {
    return [0, items.length];
  }
  const end = upperBound(items, point.y, read, "y");
  if (!end) {
    return [0, 0];
  }
  const top = read(items[end - 1]!).rect.top;
  return [upperBound(items, top - 0.01, read, "y"), end];
}
