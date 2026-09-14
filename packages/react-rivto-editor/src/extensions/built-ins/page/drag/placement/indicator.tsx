/** Canonical page-drop placement decoration and indicator rendering. */
import type { CSSProperties } from "react";
import type { DropAxis } from "../../../../../views/types";
import type { CanonicalDropPlacement } from "./types";
import type { DropPlacement } from "../types";

const EDGELESS_CARD_CONTENT_SELECTOR = "[data-edgeless-card-content]";
const PAGE_DROP_INDICATOR_CLASS = "page-drop-indicator";
const PAGE_SURFACE_SELECTOR = ".page-surface";

/**
 * Adds indicator ownership and layout data to a canonical placement.
 *
 * @param placement - Semantic child-list gap or inside target.
 * @param layoutAxis - Destination sibling layout.
 * @param childDropIndent - Pixels represented by one outline depth.
 * @param gapEdge - Physical edge approached for a between placement.
 * @returns Renderable placement, or null for an empty document root.
 */
export function withDropIndicator(
  placement: CanonicalDropPlacement | undefined,
  layoutAxis: DropAxis | undefined,
  childDropIndent: number,
  gapEdge?: "before" | "after",
): DropPlacement | null {
  if (!placement) return null;
  const indicatorId = placement.kind === "inside"
    ? placement.parentId
    : placement.nextId ?? placement.previousId ?? placement.parentId;
  return indicatorId ? { ...placement, indicatorId, layoutAxis, childDropIndent, gapEdge } : null;
}

/** Finds one block in the indicator's current surface. */
function surfaceBlock(host: HTMLElement, id: string | null): HTMLElement | null {
  if (!id) return null;
  const surface = host.closest<HTMLElement>(`${PAGE_SURFACE_SELECTOR}, ${EDGELESS_CARD_CONTENT_SELECTOR}`);
  return surface?.querySelector<HTMLElement>(`[data-block-id="${CSS.escape(id)}"]`) ?? null;
}

/** Calculates one midpoint line relative to its indicator-owning block. */
function betweenIndicatorStyle(
  placement: DropPlacement & { readonly kind: "between" },
  host: HTMLElement,
  row: HTMLElement | null,
): { readonly axis: "horizontal" | "vertical"; readonly style: CSSProperties } {
  const previous = surfaceBlock(host, placement.previousId);
  const next = surfaceBlock(host, placement.nextId);
  const previousRect = previous?.getBoundingClientRect();
  const nextRect = next?.getBoundingClientRect();
  const hostRect = host.getBoundingClientRect();
  const adjacentInDom = Boolean(previous && next && previous.nextElementSibling === next);
  const sameGridRow = Boolean(previousRect && nextRect
    && Math.max(previousRect.top, nextRect.top) < Math.min(previousRect.bottom, nextRect.bottom));
  const boundaryRect = previousRect ?? nextRect;
  const gridBoundaryAxis = placement.gapPointer && boundaryRect
    ? Math.abs(placement.gapPointer.x - (previousRect ? boundaryRect.right : boundaryRect.left))
      <= Math.abs(placement.gapPointer.y - (previousRect ? boundaryRect.bottom : boundaryRect.top))
      ? "vertical"
      : "horizontal"
    : "vertical";
  const axis = placement.layoutAxis === "horizontal"
    || (placement.layoutAxis === "grid" && (sameGridRow
      || ((!previousRect || !nextRect) && gridBoundaryAxis === "vertical")))
    ? "vertical"
    : "horizontal";
  let style: CSSProperties;
  if (axis === "vertical") {
    const adjacent = adjacentInDom && Boolean(previousRect && nextRect
      && nextRect.left - previousRect.right <= placement.childDropIndent);
    const preferPrevious = placement.gapPointer
      ? Math.abs(placement.gapPointer.x - (previousRect?.right ?? Number.NEGATIVE_INFINITY))
        <= Math.abs(placement.gapPointer.x - (nextRect?.left ?? Number.POSITIVE_INFINITY))
      : placement.gapEdge === "after";
    const x = previousRect && nextRect
      ? adjacent
        ? (previousRect.right + nextRect.left) / 2
        : preferPrevious ? previousRect.right : nextRect.left
      : nextRect?.left ?? previousRect?.right ?? hostRect.left;
    style = { left: x - hostRect.left, top: 0, bottom: 0 };
  } else {
    const adjacent = adjacentInDom && Boolean(previousRect && nextRect
      && nextRect.top - previousRect.bottom <= placement.childDropIndent);
    const preferPrevious = placement.gapPointer
      ? Math.abs(placement.gapPointer.y - (previousRect?.bottom ?? Number.NEGATIVE_INFINITY))
        <= Math.abs(placement.gapPointer.y - (nextRect?.top ?? Number.POSITIVE_INFINITY))
      : placement.gapEdge === "after";
    const y = previousRect && nextRect
      ? adjacent
        ? (previousRect.bottom + nextRect.top) / 2
        : preferPrevious ? previousRect.bottom : nextRect.top
      : nextRect?.top ?? previousRect?.bottom ?? row?.getBoundingClientRect().bottom ?? hostRect.bottom;
    const emptyChildList = !placement.previousId && !placement.nextId;
    style = {
      top: y - hostRect.top,
      left: emptyChildList ? placement.childDropIndent : 0,
      right: 0,
    };
  }
  return { axis, style };
}

/**
 * Renders unified feedback for a canonical between or inside placement.
 *
 * @param props - Placement and stable DOM host receiving the portal.
 * @returns One inert indicator element.
 */
export function PageDropIndicator({
  placement,
  host,
  row,
}: {
  readonly placement: DropPlacement;
  readonly host: HTMLElement;
  readonly row: HTMLElement | null;
}) {
  const between = placement.kind === "between"
    ? betweenIndicatorStyle(placement, host, row)
    : undefined;
  return (
    <span
      className={PAGE_DROP_INDICATOR_CLASS}
      data-kind={placement.kind}
      data-axis={between?.axis}
      style={between?.style}
      aria-hidden="true"
    />
  );
}
