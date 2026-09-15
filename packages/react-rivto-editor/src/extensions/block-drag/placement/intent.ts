/** Layout-aware drop intent and half-split placement calculations. */
import type { DropAxis } from "../../../views/types";
import type { HitDropIntent, HitRect, PointerDropReason } from "../pointer/types";

/**
 * Reports whether a block owns a fixed child outline.
 *
 * Its title is outline chrome; its descendants provide the sortable items or
 * accepting fields. The spatial axis is independent metadata and may be absent.
 *
 * @param candidate - Measured block to classify.
 * @returns `true` when inside-append would create a sibling shell.
 */
export function isStructuralLayout(candidate: {
  readonly dropAxis?: DropAxis;
  readonly childOutline?: "free" | "fixed";
}): boolean {
  return candidate.childOutline === "fixed";
}

/**
 * Chooses the placement rule for a resolved pointer hit.
 *
 * Chrome (a filled board's title) and the page's outer root edges are
 * before/after that block in the outline, never inside as a new column. A
 * field (empty lane, column, cell, empty board) takes the writing block
 * inside. Fixed structural layouts retain axis-specific sibling sorting, while
 * free outline lanes use ordinary row geometry so a row center can nest.
 * Grid edges remain sortable while their center can support nesting.
 *
 * @param input - Hit reason, parent/source axes, and whether the target is a field.
 * @returns Placement rule consumed by the drop resolver.
 */
export function hitDropIntent(input: {
  readonly reason: PointerDropReason;
  readonly parentAxis?: DropAxis;
  readonly activeAxis?: DropAxis;
  /** True when the hovered block itself accepts empty-body drops (column, cell, board). */
  readonly targetAcceptsDrop?: boolean;
}): HitDropIntent {
  let result: HitDropIntent = "geometry";
  if (input.reason === "chrome" || input.reason === "root-edge") {
    result = "sibling-edge";
  } else if (input.parentAxis && input.parentAxis === input.activeAxis) {
    if (input.parentAxis === "horizontal") result = "axis-horizontal";
    else if (input.parentAxis === "grid") result = "axis-grid";
    else result = "axis-vertical";
  } else if (input.reason === "container" || input.targetAcceptsDrop) {
    result = "inside-field";
  } else if (input.parentAxis === "horizontal") {
    result = "axis-horizontal";
  } else if (input.parentAxis === "grid") {
    result = "axis-grid";
  } else if (input.parentAxis === "vertical") {
    result = "axis-vertical";
  }
  return result;
}

/**
 * Places a drop on a layout shell's title without creating a child field.
 *
 * Half-split only. "After" stays after the board; it does not become
 * "before the first column", which is what outline-gap after-placement does
 * for ordinary parents and what painted a board-sized line.
 *
 * @param targetId - Layout shell that owns the title row.
 * @param row - Title-row rectangle.
 * @param cursorY - Viewport Y of the pointer.
 * @returns Before/after placement attached to that title row.
 */
export function resolveChromePlacement(
  targetId: string,
  row: HitRect,
  cursorY: number,
): {
  readonly targetId: string;
  readonly position: "before" | "after";
} {
  const after = cursorY >= row.top + (row.bottom - row.top) / 2;
  return {
    targetId,
    position: after ? "after" : "before",
  };
}

/**
 * Places a drop among grid children (bento tiles).
 *
 * Outer rims insert siblings in reading order. The center nests into the tile
 * when the target allows children.
 *
 * @param targetId - Hovered grid child.
 * @param rect - Rectangle used for rim and half-split tests.
 * @param cursorX - Viewport X of the pointer.
 * @param cursorY - Viewport Y of the pointer.
 * @param gapDropZone - Vertical rim thickness in CSS pixels.
 * @param allowChildPlacement - Whether the hovered tile may receive nested children.
 * @returns Placement attached to the hovered tile.
 */
export function resolveGridPlacement(
  targetId: string,
  rect: HitRect,
  cursorX: number,
  cursorY: number,
  gapDropZone: number,
  allowChildPlacement: boolean = true,
): {
  readonly targetId: string;
  readonly position: "before" | "after" | "inside";
} {
  const verticalEdge = Math.min(gapDropZone, (rect.bottom - rect.top) / 3);
  const horizontalEdge = Math.min(gapDropZone, (rect.right - rect.left) / 4);
  const vertical = cursorY < rect.top + verticalEdge || cursorY > rect.bottom - verticalEdge;
  const horizontal = cursorX < rect.left + horizontalEdge || cursorX > rect.right - horizontalEdge;
  const edge = vertical
    ? (cursorY < rect.top + (rect.bottom - rect.top) / 2 ? "before" : "after")
    : (cursorX < rect.left + (rect.right - rect.left) / 2 ? "before" : "after");
  const onRim = vertical || horizontal;
  const useEdge = onRim || !allowChildPlacement;
  return {
    targetId,
    position: useEdge ? edge : "inside",
  };
}
