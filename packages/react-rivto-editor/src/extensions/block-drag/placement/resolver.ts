/** Canonical placement resolution for one dnd-kit movement event. */
import type { DragMoveEvent } from "@dnd-kit/core";
import type { BlockDropPlacementOptions, DropAxis } from "../../../views/types";
import {
  resolveAfterDropPlacement,
  resolveBlockDropPlacementOptions,
  resolveInsideDropPlacement,
  type DropBlock,
} from "./utils";
import { resolveSiblingEdgePlacement, resolveGeometryPlacement } from "./geometry";
import {
  hitDropIntent,
  resolveChromePlacement,
  resolveGridPlacement,
} from "./intent";
import type { PointerDropReason } from "../pointer/types";
import type { DropPlacement, PointerCoordinates } from "../types";
import { withDropIndicator } from "./indicator";

/**
 * Resolves the insertion line nearest the pointer.
 *
 * A pointer over the row body appends inside that block and highlights it. A
 * pointer in a gap renders a line; horizontal movement then snaps that line to
 * every structurally available depth.
 *
 * @param event - Current dnd-kit movement including the active and over rects.
 * @param blocks - Latest complete document tree used to resolve ancestor depth.
 * @param childDropIndent - Horizontal pixels representing one requested depth.
 * @param gapDropZone - Vertical pixels reserved at the top and bottom of a row.
 * @param allowChildPlacement - Global child-placement policy.
 * @param pointer - Live viewport cursor, or null during keyboard movement.
 * @returns A valid candidate destination and indicator, or null when the
 * pointer is not over a registered row.
 */
export function resolveDropPlacement(
  event: DragMoveEvent,
  blocks: readonly DropBlock[],
  childDropIndent: number,
  gapDropZone: number,
  allowChildPlacement: boolean,
  pointer: PointerCoordinates | null,
): DropPlacement | null {
  if (!event.over) return null;
  const indicatorId = String(event.over.id);
  // Keyboard movement has no cursor, so the translated draggable rect stands in
  // for one. That rect is already free of dnd-kit's scroll adjustment.
  const activeRect = event.active.rect.current.translated ?? event.active.rect.current.initial;
  const cursorX = pointer
    ? pointer.x
    : activeRect ? activeRect.left + activeRect.width / 2 : event.over.rect.left;
  const cursorY = pointer
    ? pointer.y
    : activeRect ? activeRect.top + activeRect.height / 2 : event.over.rect.top;
  let result: DropPlacement | null = null;
  const data = event.over.data.current;
  const parentOptions = resolveBlockDropPlacementOptions(
    childDropIndent,
    gapDropZone,
    data?.parentDropPlacement as BlockDropPlacementOptions | undefined,
    allowChildPlacement,
  );
  const targetOptions = resolveBlockDropPlacementOptions(
    childDropIndent,
    gapDropZone,
    data?.targetDropPlacement as BlockDropPlacementOptions | undefined,
    allowChildPlacement,
  );
  const parentAllowsChildren = parentOptions.allowChildPlacement
    && data?.parentChildOutline !== "fixed";
  const intent = hitDropIntent({
    reason: (data?.hitReason as PointerDropReason | undefined) ?? "row",
    parentAxis: data?.sortChildren as DropAxis | undefined,
    activeAxis: event.active.data.current?.sortChildren as DropAxis | undefined,
    targetAcceptsDrop: data?.targetAcceptsDrop === true,
  });
  if (intent === "sibling-edge") {
    // Fixed-outline chrome and document edges are before/after, never inside.
    const edge = resolveChromePlacement(indicatorId, event.over.rect, cursorY).position;
    result = resolveSiblingEdgePlacement(blocks, indicatorId, edge, undefined, parentOptions.childDropIndent);
  } else if (intent === "inside-field") {
    // An explicitly accepting body receives the drop as a child.
    result = targetOptions.allowChildPlacement
      ? withDropIndicator(resolveInsideDropPlacement(indicatorId), undefined, targetOptions.childDropIndent)
      : null;
  } else if (intent === "axis-horizontal") {
    const edge = cursorX < event.over.rect.left + event.over.rect.width / 2 ? "before" : "after";
    result = resolveSiblingEdgePlacement(blocks, indicatorId, edge, "horizontal", parentOptions.childDropIndent);
  } else if (intent === "axis-grid") {
    const placement = resolveGridPlacement(
      indicatorId,
      event.over.rect,
      cursorX,
      cursorY,
      parentOptions.gapDropZone,
      targetOptions.allowChildPlacement,
    );
    result = placement.position === "inside"
      ? withDropIndicator(resolveInsideDropPlacement(indicatorId), "grid", targetOptions.childDropIndent)
      : resolveSiblingEdgePlacement(
        blocks,
        indicatorId,
        placement.position,
        "grid",
        parentOptions.childDropIndent,
      );
  } else if (intent === "axis-vertical") {
    // Fixed vertical layouts sort complete items, including their descendants.
    const edge = cursorY < event.over.rect.top + event.over.rect.height / 2 ? "before" : "after";
    result = resolveSiblingEdgePlacement(blocks, indicatorId, edge, "vertical", parentOptions.childDropIndent);
  } else if (pointer) {
    result = resolveGeometryPlacement(
      blocks,
      { id: indicatorId, rect: event.over.rect },
      cursorX,
      cursorY,
      {
        ...parentOptions,
        allowChildPlacement: parentAllowsChildren && targetOptions.allowChildPlacement,
      },
    );
  } else {
    // Keyboard movement carries no cursor, so the stand-in rect sits over a row
    // center rather than inside a narrow gap. Row halves then decide the
    // sibling edge and nesting stays at the hovered row's own depth.
    const after = cursorY >= event.over.rect.top + event.over.rect.height / 2;
    if (!after) {
      result = resolveSiblingEdgePlacement(
        blocks,
        indicatorId,
        "before",
        data?.sortChildren as DropAxis | undefined,
        parentOptions.childDropIndent,
      );
    } else {
      const placement = resolveAfterDropPlacement(blocks, indicatorId, 0);
      result = withDropIndicator(
        placement,
        data?.sortChildren as DropAxis | undefined,
        parentOptions.childDropIndent,
        "after",
      );
    }
  }
  return result?.kind === "between" && pointer ? { ...result, gapPointer: pointer } : result;
}
