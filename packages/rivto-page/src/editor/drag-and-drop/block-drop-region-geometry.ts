import type { InputRegion, RegionIdentity } from "@chulane/rivto-root";
import type {
  BlockDropEdgeRegion,
  BlockDropDestination,
  BlockDropIndicator,
  BlockDropPoint,
  BlockDropRegion,
  BlockDropTargetRegistration,
  BlockDropGeometryTarget,
  BlockDropBounds,
  BlockDropGeometry,
  BlockDropGeometryReader,
} from "./types";

/**
 * Builds immutable-by-contract viewport bounds from an origin and dimensions.
 *
 * @param left - Viewport left coordinate.
 * @param top - Viewport top coordinate.
 * @param width - Physical width; nonpositive values are never hit.
 * @param height - Physical height; nonpositive values are never hit.
 * @returns Bounds suitable for DOM-free geometry tests and synchronous hit testing.
 */
export function dropBounds(
  left: number,
  top: number,
  width: number,
  height: number,
): BlockDropBounds {
  return { left, top, width, height, right: left + width, bottom: top + height };
}

/**
 * Reads one anchor's current viewport bounds and local-to-viewport scale.
 *
 * @param region - Root capability bound to this anchor and attachment.
 * @returns Detached bounds and style values for this synchronous query; no browser
 * geometry or computed style object is retained and no cache survives scrolling.
 * Registered body bounds are supplied separately by the Page layout registry.
 */
export function readDropGeometry(
  region: Pick<InputRegion, "readLayout">,
): BlockDropGeometry | undefined {
  const layout = region.readLayout(["--rivto-drop-target-size", "--rivto-block-indent"]);
  if (!layout) {
    return undefined;
  }
  const { left, top, width, height } = layout.bounds;
  const rect = dropBounds(left, top, width, height);
  return {
    rect,
    direction: layout.direction,
    targetSize: layout.properties["--rivto-drop-target-size"] ?? "",
    indent: layout.properties["--rivto-block-indent"] ?? "",
    scaleX: layout.scaleX,
    scaleY: layout.scaleY,
  };
}

/**
 * Tests inclusive physical bounds without expanding an empty rectangle.
 *
 * @param rect - Viewport bounds of the declared area.
 * @param point - Current viewport pointer.
 * @returns True for a point inside a nonempty rectangle.
 */
export function containsDropPoint(rect: BlockDropBounds, point: BlockDropPoint): boolean {
  return (
    rect.width > 0 &&
    rect.height > 0 &&
    point.x >= rect.left &&
    point.x <= rect.right &&
    point.y >= rect.top &&
    point.y <= rect.bottom
  );
}

/**
 * Orders declarations sharing an anchor after their explicit registration priority.
 *
 * Block edges win corners over inline edges; inside regions have the lowest rank.
 * Equal ranks retain the first matching declaration.
 *
 * @param region - Live declaration on the measured anchor.
 * @returns Two for block edges, one for inline edges, or zero for inside regions.
 */
export function dropRegionRank(region: BlockDropRegion): number {
  if (region.kind === "inside") {
    return 0;
  }
  return region.side.startsWith("block") ? 2 : 1;
}

/**
 * Tests a declaration's physical area and its optional unoccupied-background restriction.
 *
 * Measurements are borrowed from this anchor's current query. Background checks
 * use the captured hit, so child content cannot become an ancestor append target.
 *
 * @param regionIdentity - Opaque identity of the registered anchor owning the declaration.
 * @param region - Live edge or inside declaration to test.
 * @param geometry - Anchor bounds and computed style captured for this query.
 * @param point - Viewport coordinates in CSS pixels.
 * @param measurements - Root-backed measurements for background ownership.
 * @returns True when both physical coverage and background ownership match.
 * @throws If an inset edge size is negative or nonfinite, or a Root measurement fails.
 */
export function containsDropRegion(
  regionIdentity: RegionIdentity,
  region: BlockDropRegion,
  geometry: BlockDropGeometry,
  point: BlockDropPoint,
  measurements: Pick<BlockDropGeometryReader, "isBackground">,
): boolean {
  const rect =
    region.kind === "edge" && region.coverage !== "bounds"
      ? dropEdgeRect(region, geometry)
      : geometry.rect;
  if (!containsDropPoint(rect, point)) {
    return false;
  }
  if (region.kind === "inside" && region.coverage === "background") {
    return measurements.isBackground(regionIdentity, point);
  }
  return true;
}

/**
 * Tests a point against the cross-axis span of a linear insertion boundary.
 *
 * Vertical lists use the boundary width; horizontal lists use its height. The
 * flow coordinate is intentionally ignored because endpoint padding may extend
 * beyond the feedback line. Grid boundaries retain their separate geometry.
 *
 * @param bounds - Viewport feedback rectangle supplied by the region resolver.
 * @param point - Current viewport pointer.
 * @param axis - List flow selecting the perpendicular coordinate.
 * @returns True within the inclusive cross-axis span, or false for grid flow.
 */
export function containsDropCrossAxisPoint(
  bounds: BlockDropIndicator,
  point: BlockDropPoint,
  axis: "vertical" | "horizontal" | "grid",
): boolean {
  if (axis === "vertical") {
    return point.x >= bounds.left && point.x <= bounds.left + bounds.width;
  }
  if (axis === "horizontal") {
    return point.y >= bounds.top && point.y <= bounds.top + bounds.height;
  }
  return false;
}

/**
 * Computes a logical inset edge without adding padding or modifying its anchor.
 *
 * @param region - Declared side, size and optional terminal outline bands.
 * @param geometry - Current anchor geometry and computed layout tokens.
 * @returns Inset strip capped to one third of the anchor axis and before the owned body
 * middle third, retaining inside placement even when descendants enlarge the shell.
 * Declared terminal ancestors can extend the strip toward outer indentation levels.
 * @throws If an explicit size is negative or nonfinite.
 */
export function dropEdgeRect(
  region: BlockDropEdgeRegion,
  geometry: BlockDropGeometry,
): BlockDropBounds {
  const { rect, direction, scaleX, scaleY } = geometry;
  const token = geometry.targetSize.trim();
  const size = region.size ?? (token ? Number.parseFloat(token) : 12);
  if (!Number.isFinite(size) || size < 0) {
    throw new Error("Drop target size must be finite and nonnegative");
  }
  const block = region.side.startsWith("block");
  const thickness = Math.min(size * (block ? scaleY : scaleX), contentEdgeLimit(region, geometry));
  const end = region.side.endsWith("end");
  const rtl = direction === "rtl";
  if (block) {
    const indent = (parseFloat(geometry.indent) || 28) * scaleX;
    const extra = (region.depth?.ancestors ?? 0) * indent;
    return dropBounds(
      rect.left - (rtl ? 0 : extra),
      end ? rect.bottom - thickness : rect.top,
      rect.width + extra,
      thickness,
    );
  }
  return dropBounds(
    end !== rtl ? rect.right - thickness : rect.left,
    rect.top,
    thickness,
    rect.height,
  );
}

/**
 * Selects a terminal depth band and places feedback on the anchor's physical edge.
 *
 * @param entry - Mounted target supplying canonical declarations.
 * @param region - Edge whose rectangle contains the pointer, or bounds append region.
 * @param geometry - Shared synchronous measurement of the anchor.
 * @param point - Pointer used only for explicit depth partitioning.
 * @returns Declared destination and physical feedback, before permission validation.
 * @throws If the declared edge thickness is negative or nonfinite.
 */
export function dropRegionTarget(
  entry: BlockDropTargetRegistration,
  region: BlockDropRegion,
  geometry: BlockDropGeometry,
  point: BlockDropPoint,
): BlockDropGeometryTarget {
  if (region.kind === "inside") {
    return { identity: entry.identity, destination: region.destination, region };
  }
  const rect = dropEdgeRect(region, geometry);
  let destination = region.destination;
  let left = rect.left;
  let width = rect.width;
  if (region.depth?.destinations.length) {
    const indent = (parseFloat(geometry.indent) || 28) * geometry.scaleX;
    const rtl = geometry.direction === "rtl";
    const offset = rtl ? rect.right - point.x : point.x - rect.left;
    const level = dropOutlineLevel(
      region.depth.destinations,
      offset / indent,
      geometry.continuesOutline,
    );
    destination = region.depth.destinations[level]!;
    width = Math.max(0, rect.width - level * indent);
    left = rtl ? rect.left : rect.left + level * indent;
  }
  const horizontal = region.side.startsWith("block");
  const end = region.side.endsWith("end");
  const indicator = horizontal
    ? { left, top: (end ? geometry.rect.bottom : geometry.rect.top) - 1, width, height: 2 }
    : {
        left:
          (end !== (geometry.direction === "rtl") ? geometry.rect.right : geometry.rect.left) - 1,
        top: rect.top,
        width: 2,
        height: rect.height,
      };
  return { identity: entry.identity, destination, indicator, region };
}

/**
 * Clamps pointer indentation to the depth choices allowed by the owning layout.
 *
 * A local child scope omits the terminal inside band while retaining sibling and
 * ancestor bands. A sole explicit destination remains available. Body declarations
 * bypass this calculation and continue accepting inside drops independently.
 *
 * @param destinations - Nonempty ordered outline bands from the edge declaration.
 * @param offset - Pointer displacement in indentation units, already accounting for scale and RTL.
 * @param continuesOutline - False for a local child layout; omission defaults to outline continuation.
 * @returns The selected nonnegative index within the eligible destination bands.
 */
function dropOutlineLevel(
  destinations: readonly BlockDropDestination[],
  offset: number,
  continuesOutline = true,
): number {
  let last = destinations.length - 1;
  if (!continuesOutline && last > 0 && destinations[last]?.kind === "inside") {
    last -= 1;
  }
  return Math.min(last, Math.max(0, Math.floor(offset)));
}

/**
 * Limits an edge so its owner's middle body remains available for inside drops.
 *
 * Shell padding retains its sorting area. Child subtree height cannot enlarge an
 * inset edge over the primary content, and inline limits respect RTL direction.
 *
 * @param region - Declared logical edge.
 * @param geometry - Shell and optional registered body in viewport coordinates.
 * @returns Maximum inset thickness in viewport pixels, never negative.
 */
function contentEdgeLimit(region: BlockDropEdgeRegion, geometry: BlockDropGeometry): number {
  const { rect, contentRect: content } = geometry;
  const block = region.side.startsWith("block");
  const limit = (block ? rect.height : rect.width) / 3;
  if (!content) {
    return limit;
  }
  const end = region.side.endsWith("end");
  const trailing = block ? end : end !== (geometry.direction === "rtl");
  const start = block ? rect.top : rect.left;
  const finish = block ? rect.bottom : rect.right;
  const bodyStart = block ? content.top : content.left;
  const bodyEnd = block ? content.bottom : content.right;
  const third = (bodyEnd - bodyStart) / 3;
  const distance = trailing ? finish - (bodyEnd - third) : bodyStart + third - start;
  return Math.max(0, Math.min(limit, distance));
}
