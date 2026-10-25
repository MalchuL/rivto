import { registeredBlockRegion } from "../../presentation/components/block-layout/block-layout-regions";
import { BLOCK_DROP_EXCLUDE_ATTRIBUTE } from "./block-drop-attributes";
import type {
  BlockDropEdgeRegion,
  BlockDropDestination,
  BlockDropIndicator,
  BlockDropPoint,
  BlockDropRegion,
  BlockDropTargetRegistration,
  ResolvedBlockDropTarget,
} from "./types";

/** Viewport bounds used without constructing browser-only DOMRect objects. */
export interface BlockDropBounds {
  readonly left: number;
  readonly right: number;
  readonly top: number;
  readonly bottom: number;
  readonly width: number;
  readonly height: number;
}

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

/** A local geometry read, shared by declarations on one anchor for one resolution. */
export interface BlockDropGeometry {
  readonly rect: BlockDropBounds;
  /** Owned content or primary row, when mounted and nonempty; never a descendant block. */
  readonly contentRect?: BlockDropBounds;
  /** False for an owned local child layout; omission preserves ordinary outline depth. */
  readonly continuesOutline?: boolean;
  readonly style: CSSStyleDeclaration;
  readonly scaleX: number;
  readonly scaleY: number;
}

/**
 * Reads one anchor's current viewport bounds and local-to-viewport scale.
 *
 * @param element - Existing mounted layout element.
 * @returns Geometry for this synchronous query only; no cache survives scrolling.
 * Registered body bounds are read without searching unregistered DOM or child blocks.
 */
export function readDropGeometry(element: HTMLElement): BlockDropGeometry {
  const rect = element.getBoundingClientRect();
  return {
    rect,
    contentRect: readContentBounds(element),
    continuesOutline: continuesDropOutline(element),
    style: element.ownerDocument.defaultView!.getComputedStyle(element),
    scaleX: element.offsetWidth ? rect.width / element.offsetWidth : 1,
    scaleY: element.offsetHeight ? rect.height / element.offsetHeight : 1,
  };
}

/**
 * Reads whether this anchor's owned child layout continues ordinary outline depth.
 *
 * Only the existing registered child host participates. Its local declaration
 * separates outer sibling placement from body/child drops; no block type, CSS
 * class, descendant traversal or unregistered DOM marker determines this policy.
 * Missing declarations keep ordinary outline behavior for leaves and custom anchors.
 *
 * @param element - Existing registered shell or wrapping item in this occurrence.
 * @returns False for an explicitly local child scope; true for outline or absent scopes.
 */
export function continuesDropOutline(element: HTMLElement): boolean {
  return registeredBlockRegion(element, "children")?.dataset.blockDropScope !== "local";
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
 * use the native hit, so child content cannot become an ancestor append target.
 *
 * @param element - Registered anchor owning the declaration.
 * @param region - Live edge or inside declaration to test.
 * @param geometry - Anchor bounds and computed style captured for this query.
 * @param point - Viewport coordinates in CSS pixels.
 * @param hit - Current native hit inside the editor occurrence.
 * @returns True when both physical coverage and background ownership match.
 * @throws If an inset edge size is negative or nonfinite.
 */
export function containsDropRegion(
  element: HTMLElement,
  region: BlockDropRegion,
  geometry: BlockDropGeometry,
  point: BlockDropPoint,
  hit: Element,
): boolean {
  const rect =
    region.kind === "edge" && region.coverage !== "bounds"
      ? dropEdgeRect(region, geometry)
      : geometry.rect;
  if (!containsDropPoint(rect, point)) {
    return false;
  }
  if (region.kind === "inside" && region.coverage === "background") {
    return isDropBackground(element, hit, point);
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
  const { rect, style, scaleX, scaleY } = geometry;
  const token = style.getPropertyValue("--rivto-drop-target-size").trim();
  const size = region.size ?? (token ? Number.parseFloat(token) : 12);
  if (!Number.isFinite(size) || size < 0) {
    throw new Error("Drop target size must be finite and nonnegative");
  }
  const block = region.side.startsWith("block");
  const thickness = Math.min(size * (block ? scaleY : scaleX), contentEdgeLimit(region, geometry));
  const end = region.side.endsWith("end");
  const rtl = style.direction === "rtl";
  if (block) {
    const indent = (parseFloat(style.getPropertyValue("--rivto-block-indent")) || 28) * scaleX;
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
): ResolvedBlockDropTarget {
  if (region.kind === "inside") {
    return { element: entry.element, destination: region.destination, region };
  }
  const rect = dropEdgeRect(region, geometry);
  let destination = region.destination;
  let left = rect.left;
  let width = rect.width;
  if (region.depth?.destinations.length) {
    const indent =
      (parseFloat(geometry.style.getPropertyValue("--rivto-block-indent")) || 28) * geometry.scaleX;
    const rtl = geometry.style.direction === "rtl";
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
          (end !== (geometry.style.direction === "rtl")
            ? geometry.rect.right
            : geometry.rect.left) - 1,
        top: rect.top,
        width: 2,
        height: rect.height,
      };
  return { element: entry.element, destination, indicator, region };
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
 * Restricts background append to space outside owned content, child placements and explicit exclusions.
 *
 * The registered own content/row stays occupied even when its controls have no
 * content marker. This does not exclude those controls from their owner's inside
 * region; it only prevents child-list background from replacing that body action.
 *
 * @param host - Declared background owner.
 * @param hit - Browser's visible native hit.
 * @param point - Exact viewport coordinate; a rounded native hit outside its box does not occupy background.
 * @returns Whether the hit belongs to unoccupied host chrome rather than item content.
 */
export function isDropBackground(host: HTMLElement, hit: Element, point: BlockDropPoint): boolean {
  const content = readContentBounds(host);
  if (content && containsDropPoint(content, point)) {
    return false;
  }
  for (let node: Element | null = hit; node && node !== host; node = node.parentElement) {
    if (node.hasAttribute(BLOCK_DROP_EXCLUDE_ATTRIBUTE)) {
      return false;
    }
    if (
      node.matches("[data-block-id], [data-block-item-id], [data-block-content]") &&
      containsDropPoint(node.getBoundingClientRect(), point)
    ) {
      return false;
    }
  }
  return host.contains(hit);
}

/**
 * Reads a mounted owner's body, falling back to its primary row for contentless layouts.
 *
 * Empty or omitted regions do not contribute a protected rectangle. The lookup
 * uses primitive registrations only and never searches descendants or the document.
 *
 * @param element - Current registered drop anchor.
 * @returns Nonempty content/row viewport bounds, or undefined when neither exists.
 */
function readContentBounds(element: HTMLElement): BlockDropBounds | undefined {
  for (const role of ["content", "row"] as const) {
    const region = registeredBlockRegion(element, role);
    const rect = region?.getBoundingClientRect();
    if (rect && rect.width > 0 && rect.height > 0) {
      return rect;
    }
  }
  return undefined;
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
  const trailing = block ? end : end !== (geometry.style.direction === "rtl");
  const start = block ? rect.top : rect.left;
  const finish = block ? rect.bottom : rect.right;
  const bodyStart = block ? content.top : content.left;
  const bodyEnd = block ? content.bottom : content.right;
  const third = (bodyEnd - bodyStart) / 3;
  const distance = trailing ? finish - (bodyEnd - third) : bodyStart + third - start;
  return Math.max(0, Math.min(limit, distance));
}
