import {
  dropBounds,
  dropEdgeRect,
  containsDropPoint,
  containsDropCrossAxisPoint,
  continuesDropOutline,
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
  BlockDropRegion,
  BlockDropGapRegion,
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
 * Explicit trailing/leading areas sharing an endpoint destination use that
 * endpoint's feedback, even with separate sibling-boundary presentation. Their
 * own full-bounds hit area is retained; unrelated explicit destinations are not
 * replaced by the list's free-space insertion.
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
  if (!layout.gaps) {
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
  // Free endpoint space shares the endpoint's line, including explicit root areas.
  const outer = resolveListEndGap(layout, items, point, hit, read, rtl);
  if (outer && (!edge || matchesEndpointBoundary(outer, edge))) {
    return outer;
  }
  if (edge && layout.boundaries === "separate") {
    return;
  }
  // Real neighbor seams precede inferred gutter continuation.
  const pair = resolveGapPairs(layout, items, point, hit, read, rtl, edge);
  if (pair || edge) {
    return pair;
  }
  const gutter = resolveLayoutGutter(layout, items, point, hit, read, rtl);
  if (!gutter) {
    return;
  }
  return resolveGapPairs(layout, items, point, hit, read, rtl, gutter) ?? gutter;
}

/**
 * Identifies perpendicular linear flows without assigning a single axis to grids.
 *
 * Missing layouts and equal axes do not establish a perpendicular containing scope.
 *
 * @param inner - Nearest list's flow, or undefined before reaching a list.
 * @param outer - Containing list's flow, or undefined on an ordinary anchor.
 * @returns True for vertical/horizontal pairs in either order; false otherwise.
 */
export function areDropAxesPerpendicular(
  inner: BlockDropLayoutRegistration["axis"] | undefined,
  outer: BlockDropLayoutRegistration["axis"] | undefined,
): boolean {
  return (
    (inner === "vertical" && outer === "horizontal") ||
    (inner === "horizontal" && outer === "vertical")
  );
}

/**
 * Identifies a canonical sibling boundary whose two neighbors are stationary.
 *
 * Moving roots do not reserve a shared inset strip. This reads declared IDs only;
 * live adjacency and source permissions remain checked by the target manager.
 *
 * @param destination - Candidate carrying actual parent and canonical neighbor IDs.
 * @param excluded - Captured moving roots, or undefined when none are omitted.
 * @returns True only for two present neighbor IDs outside the moving group.
 */
function hasStationaryDropNeighbors(
  destination: BlockDropDestination,
  excluded?: ReadonlySet<string>,
): boolean {
  return (
    destination.kind === "between" &&
    destination.previousId !== null &&
    destination.nextId !== null &&
    !excluded?.has(destination.previousId) &&
    !excluded?.has(destination.nextId)
  );
}

/**
 * Recognizes an inset choice at its own list level or inside its receiving block.
 *
 * Ancestor outdent choices are excluded so their shared feedback can still be
 * normalized by the appropriate containing layout.
 *
 * @param target - Nearest resolved region, or undefined outside its declaration.
 * @returns True for an edge that stays local rather than selecting an ancestor parent.
 */
export function isLocalOutlineEdge(target: ResolvedBlockDropTarget | undefined): boolean {
  return (
    target?.region?.kind === "edge" &&
    (target.destination.kind !== "between" ||
      target.destination.parentId === target.region.destination.parentId)
  );
}

/**
 * Reserves a declared local owner's stationary sibling strip over a nested edge.
 *
 * Block-axis corner priority remains intact. Outline continuation and moving
 * neighbors preserve the nearer edge's ordinary nesting and endpoint behavior.
 *
 * @param outer - Matched ancestor anchor, destination and edge declaration.
 * @param inner - Nearer explicit edge whose declaration overlaps the ancestor rim.
 * @param excluded - Captured moving roots used to identify stationary neighbors.
 * @returns True when the ancestor's local sibling seam wins this overlap.
 */
export function prefersOuterSiblingEdge(
  outer: Pick<ResolvedBlockDropTarget, "element" | "destination" | "region">,
  inner: Pick<ResolvedBlockDropTarget, "region">,
  excluded?: ReadonlySet<string>,
): boolean {
  if (
    continuesDropOutline(outer.element) ||
    !hasStationaryDropNeighbors(outer.destination, excluded)
  ) {
    return false;
  }
  return (
    outer.region?.kind === "edge" &&
    (outer.region.side.startsWith("block") ||
      inner.region?.kind !== "edge" ||
      !inner.region.side.startsWith("block"))
  );
}

/**
 * Prefers a nested linear gap over an ancestor boundary when their scopes overlap.
 *
 * A boundary between two stationary canonical neighbors keeps its own inset
 * strip instead of switching to a descendant endpoint while crossing the seam.
 * Moving source neighbors do not reserve that strip; permissions are still
 * checked once on the selected result, without rejection-based fallback.
 * The nested gap must choose a different receiving parent. Within the cross-axis
 * feedback span it keeps priority; a perpendicular containing layout permits
 * its complete background span. An owner's local scope preserves its same-axis outer rim; block-axis outer
 * edges retain corner priority over inline gaps. Ancestor outdent choices
 * remain available for normalization in their own list. This only proposes geometry, not permission.
 *
 * @param layout - Nearest mounted list under the ancestor edge.
 * @param ancestor - Ancestor boundary's receiving parent and registered anchor; its own local child scope retains its external sibling rim.
 * @param point - Native viewport pointer.
 * @param hit - Native hit used to reject occupied or excluded background.
 * @param perpendicular - Whether a containing linear layout uses the other axis.
 * @param excluded - Moving roots whose adjacent boundary is not a shared seam between two stationary neighbors.
 * @returns The preferred inner gap, or undefined for grid flow, occupied space,
 * the same parent, or a point outside its eligible cross-axis span.
 */
export function resolveInnerLayoutGap(
  layout: BlockDropLayoutRegistration,
  ancestor: Pick<ResolvedBlockDropTarget, "destination" | "element" | "region">,
  point: BlockDropPoint,
  hit: Element,
  perpendicular: boolean,
  excluded?: ReadonlySet<string>,
): ResolvedBlockDropTarget | undefined {
  const outerRim = isOuterLayoutRim(layout.axis, ancestor.region);
  if (outerRim && hasStationaryDropNeighbors(ancestor.destination, excluded)) {
    return;
  }
  if (layout.axis === "grid" || !isDropBackground(layout.element, hit, point)) {
    return;
  }
  const gap = resolveLayoutGap(layout, point, hit);
  if (isLocalOwnerGap(ancestor.element, gap) && outerRim) {
    return;
  }
  if (!gap?.indicator || gap.destination.parentId === ancestor.destination.parentId) {
    return;
  }
  if (perpendicular || containsDropCrossAxisPoint(gap.indicator, point, layout.axis)) {
    return gap;
  }
}

/**
 * Recognizes ancestor edges that retain a list's external rim and block-axis corners.
 *
 * Block edges always retain corner priority. Other edges match the list's flow
 * axis; horizontal and wrapping layouts use inline edges for this comparison.
 *
 * @param axis - Declared flow of the nested list.
 * @param region - Ancestor's selected declaration, absent for inferred targets.
 * @returns True for an explicit block edge or an edge along the list's flow axis.
 */
function isOuterLayoutRim(
  axis: BlockDropLayoutRegistration["axis"],
  region: BlockDropRegion | BlockDropGapRegion | undefined,
): boolean {
  const sideAxis = axis === "vertical" ? "block" : "inline";
  return (
    region?.kind === "edge" && (region.side.startsWith("block") || region.side.startsWith(sideAxis))
  );
}

/**
 * Detects a nested gap receiving children directly into a locally scoped owner.
 *
 * Such a gap cannot replace that owner's external sibling rim. Ordinary outline
 * owners retain their descendant depth choices.
 *
 * @param element - Ancestor anchor carrying its canonical block or placement identity.
 * @param gap - Nested list candidate, absent when its geometry did not match.
 * @returns True when outline continuation is disabled and the receiving parent is this owner.
 */
function isLocalOwnerGap(element: HTMLElement, gap: ResolvedBlockDropTarget | undefined): boolean {
  const ownerId = element.dataset.blockId ?? element.dataset.blockItemId;
  return !continuesDropOutline(element) && gap?.destination.parentId === ownerId;
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
  if (
    !edge &&
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
  if (
    edge &&
    (!merged || !isPairEdge(edge, previous, next, horizontal, rect, merged.destination))
  ) {
    return;
  }
  let result = merged ?? target;
  if (
    edge?.indicator &&
    merged?.indicator &&
    edge.region?.kind === "edge" &&
    edge.region.side.endsWith("end") &&
    previous.element !== edge.element &&
    previous.element.contains(edge.element) &&
    !sameOutlineBoundary(edge.destination, merged.destination)
  ) {
    // A declared terminal append keeps its destination while sharing the parent's seam.
    result = {
      ...edge,
      indicator: horizontal
        ? { ...edge.indicator, left: merged.indicator.left }
        : { ...edge.indicator, top: merged.indicator.top },
    };
  }
  return {
    ...result,
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
 * The same identity comparison also preserves a selected outdent destination
 * while normalizing its feedback through a containing layout.
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
 * Compares selected outline insertions without changing their canonical representation.
 *
 * An inside destination appends to its parent, matching a terminal between choice
 * for that parent. Two between choices still require both identical neighbors;
 * live adjacency and source permission remain the target manager's responsibility.
 *
 * @param before - Selected destination of the proposed shared feedback.
 * @param after - Physical winner whose insertion must be preserved.
 * @returns True for the same sibling boundary or equivalent parent append.
 */
export function sameOutlineBoundary(
  before: BlockDropDestination,
  after: BlockDropDestination,
): boolean {
  if (before.parentId !== after.parentId) {
    return false;
  }
  if (before.kind === "inside") {
    return after.kind === "inside" || after.nextId === null;
  }
  if (after.kind === "inside") {
    return before.nextId === null;
  }
  return sameSiblingBoundary(before, after);
}

/**
 * Matches a free endpoint to an explicit area using its declared sibling boundary.
 *
 * Near the endpoint, the selected destination can be an indented child append.
 * Its original boundary still identifies equivalent trailing controls; unrelated
 * explicit areas retain their own destination and priority.
 *
 * @param endpoint - Endpoint candidate including its pointer-selected outline level.
 * @param edge - Explicit area encountered before its containing list.
 * @returns True when the endpoint declaration describes the explicit area's gap.
 */
function matchesEndpointBoundary(
  endpoint: ResolvedBlockDropTarget,
  edge: ResolvedBlockDropTarget,
): boolean {
  const destination =
    endpoint.region?.kind === "edge" ? endpoint.region.destination : endpoint.destination;
  return sameSiblingBoundary(destination, edge.destination);
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
 * Extends declared linear-list edges through existing free space before/after the list.
 *
 * Explicit child targets retain priority. Only complete mounted endpoints are
 * eligible: virtual holes never become insertion areas. Feedback and canonical
 * neighbors come from the endpoint's existing declaration. Outline depth remains
 * available within one inset-edge thickness beyond the endpoint, matching the
 * strip inside the block; farther free space inserts at the containing list level.
 * Default row continuation includes linear child-list endpoints as well as roots;
 * numeric and disabled gutters retain their explicit distance policy. Native
 * background hits within real endpoint insets remain eligible under every policy;
 * restricting outer continuation must not disable an item's declared edge.
 * Disabling end gaps retains the adjacent measured continuation strip while
 * leaving farther end space to its separately declared background destination.
 * No padding mode, CSS measurement policy or synthetic anchor is required.
 *
 * @param layout - Existing linear list host with registered anchors and continuation policy.
 * @param items - Committed anchors in display order, already known to be nonempty.
 * @param point - Actual viewport pointer; native hit rounding does not change it.
 * @param hit - Native hit used to exclude occupied or unrelated child chrome.
 * @param read - Query-local geometry accessor shared with ordinary sibling gaps.
 * @param rtl - Whether the containing layout's logical inline order runs right to left.
 * @returns Endpoint insertion, or undefined outside free space or at virtual holes.
 */
function resolveListEndGap(
  layout: BlockDropLayoutRegistration,
  items: readonly BlockDropTargetRegistration[],
  point: BlockDropPoint,
  hit: Element,
  read: (item: BlockDropTargetRegistration) => BlockDropGeometry,
  rtl: boolean,
): ResolvedBlockDropTarget | undefined {
  if (layout.axis === "grid") {
    return;
  }
  if (!containsDropPoint(layout.element.getBoundingClientRect(), point)) {
    return;
  }
  const endpoint = listEndpoint(layout, items, point, read, rtl);
  if (!endpoint) {
    return resolveEndpointInset(layout, items, point, hit, read);
  }
  if ((layout.gutterSize ?? "row") !== "row") {
    return;
  }
  const [entry, side] = endpoint;
  if (!isDropBackground(layout.element, hit, point) && !entry.element.contains(hit)) {
    return;
  }
  const region = entry
    .getRegions()
    .find((region) => region.kind === "edge" && region.side === side);
  if (region?.kind !== "edge") {
    return;
  }
  const geometry = read(entry);
  const nearEdge = isNearEndpointEdge(region, geometry, point);
  if (layout.endGaps === false && !nearEdge) {
    return;
  }
  const depth = region.depth && nearEdge ? region.depth : undefined;
  return dropRegionTarget(entry, { ...region, depth }, geometry, point);
}

/**
 * Mirrors an endpoint's inset thickness into its existing outer free space.
 *
 * Thickness already accounts for viewport scale and own-content limits. This
 * check does not create layout space or extend beyond the owning list's bounds.
 *
 * @param region - Declared endpoint edge carrying optional outline levels.
 * @param geometry - Endpoint measurement shared with the current list query.
 * @param point - Pointer already known to be outside the mounted list interval.
 * @returns True within one measured edge thickness beyond the endpoint.
 * @throws If the declared edge size is negative or nonfinite.
 */
function isNearEndpointEdge(
  region: BlockDropEdgeRegion,
  geometry: BlockDropGeometry,
  point: BlockDropPoint,
): boolean {
  const strip = dropEdgeRect(region, geometry);
  const block = region.side.startsWith("block");
  const distance = block
    ? Math.min(Math.abs(point.y - geometry.rect.top), Math.abs(point.y - geometry.rect.bottom))
    : Math.min(Math.abs(point.x - geometry.rect.left), Math.abs(point.x - geometry.rect.right));
  return distance <= (block ? strip.height : strip.width);
}

/**
 * Selects a complete mounted endpoint beyond either end of a linear list.
 *
 * Horizontal coordinates are projected into logical order for RTL. Virtual
 * indices must identify the actual first/last display position; holes never
 * become free endpoint space merely because their neighbors are unmounted.
 *
 * @param layout - Linear flow and virtual-index policy of the registered list.
 * @param items - Nonempty mounted anchors in committed logical order.
 * @param point - Pointer in viewport coordinates.
 * @param read - Query-local cached geometry reader.
 * @param rtl - Whether inline flow runs right to left.
 * @returns The endpoint and its declared logical side, or undefined inside the
 * list interval or beyond an incomplete virtual endpoint.
 */
function listEndpoint(
  layout: BlockDropLayoutRegistration,
  items: readonly BlockDropTargetRegistration[],
  point: BlockDropPoint,
  read: (item: BlockDropTargetRegistration) => BlockDropGeometry,
  rtl: boolean,
): readonly [BlockDropTargetRegistration, BlockDropEdgeRegion["side"]] | undefined {
  const first = items[0]!;
  const last = items[items.length - 1]!;
  const a = read(first).rect;
  const b = read(last).rect;
  const horizontal = layout.axis === "horizontal";
  const inlinePoint = rtl ? -point.x : point.x;
  const inlineStart = rtl ? -a.right : a.left;
  const inlineEnd = rtl ? -b.left : b.right;
  const coordinate = horizontal ? inlinePoint : point.y;
  const start = horizontal ? inlineStart : a.top;
  const end = horizontal ? inlineEnd : b.bottom;
  const leading = coordinate < start;
  if (!leading && coordinate <= end) {
    return;
  }
  const entry = leading ? first : last;
  const indexed = entry.element.closest("[data-index]");
  if (
    layout.virtual &&
    (leading
      ? indexed?.getAttribute("data-index") !== "0"
      : !indexed?.hasAttribute("data-virtual-last"))
  ) {
    return;
  }
  const axis = horizontal ? "inline" : "block";
  return [entry, `${axis}-${leading ? "start" : "end"}`];
}

/**
 * Recovers endpoint inset edges when native hit rounding selects the layout background.
 *
 * The point must remain in an actual declared strip; occupied child content is
 * never redirected. The inset retains outline depth bands, matching the adjacent
 * outer continuation strip rather than the more distant list-level free space.
 * Only the first and last mounted anchors are measured, including virtual lists;
 * no unmounted interval or synthetic endpoint is introduced.
 *
 * @param layout - Owning linear list whose native background was hit.
 * @param items - Nonempty ordered mounted anchors.
 * @param point - Exact viewport pointer, independent of native rounding.
 * @param hit - Native hit used to preserve child and exclusion ownership.
 * @param read - Query-local cached geometry reader.
 * @returns The declared endpoint edge, or undefined outside its strip or on occupied content.
 */
function resolveEndpointInset(
  layout: BlockDropLayoutRegistration,
  items: readonly BlockDropTargetRegistration[],
  point: BlockDropPoint,
  hit: Element,
  read: (item: BlockDropTargetRegistration) => BlockDropGeometry,
): ResolvedBlockDropTarget | undefined {
  if (!isDropBackground(layout.element, hit, point)) {
    return;
  }
  const axis = layout.axis === "horizontal" ? "inline" : "block";
  for (const [entry, end] of [
    [items[0]!, "start"],
    [items[items.length - 1]!, "end"],
  ] as const) {
    const region = entry
      .getRegions()
      .find(
        (region): region is BlockDropEdgeRegion =>
          region.kind === "edge" && region.side === `${axis}-${end}`,
      );
    if (region && containsDropPoint(dropEdgeRect(region, read(entry)), point)) {
      return dropRegionTarget(entry, region, read(entry), point);
    }
  }
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
 * A descendant outline edge may belong to an ancestor placement when the merged
 * destination describes the same insertion, including terminal child append.
 * Comparing after depth selection prevents an ancestor's inside choice from
 * borrowing feedback for an unrelated sibling destination. A terminal child
 * append can also match an explicitly declared inside depth of its parent.
 *
 * @param edge - Selected anchor and original declaration.
 * @param previous - Mounted preceding sibling registration.
 * @param next - Mounted following sibling registration.
 * @param horizontal - Whether the pair uses inline rather than block edges.
 * @param bounds - Physical pair interval; a nonpositive cross axis cannot normalize feedback.
 * @param destination - Merged pair's pointer-selected destination, compared without changing the winner.
 * @returns True for that pair's current declaration on the corresponding side.
 */
function isPairEdge(
  edge: Pick<ResolvedBlockDropTarget, "element" | "region" | "destination">,
  previous: BlockDropTargetRegistration,
  next: BlockDropTargetRegistration,
  horizontal: boolean,
  bounds: BlockDropBounds,
  destination: BlockDropDestination,
): boolean {
  if ((horizontal ? bounds.height : bounds.width) <= 0) {
    return false;
  }
  const region = edge.region;
  if (region?.kind !== "edge" || !region.side.startsWith(horizontal ? "inline" : "block")) {
    return false;
  }
  const owner = region.side.endsWith("end") ? previous : next;
  if (owner.element === edge.element) {
    return owner.getRegions().includes(region);
  }
  return (
    owner.element.contains(edge.element) &&
    (sameOutlineBoundary(destination, edge.destination) ||
      owner
        .getRegions()
        .some(
          (candidate) =>
            candidate.kind === "edge" &&
            candidate.side === region.side &&
            candidate.depth?.destinations.some((depth) =>
              sameOutlineBoundary(depth, edge.destination),
            ),
        ))
  );
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
