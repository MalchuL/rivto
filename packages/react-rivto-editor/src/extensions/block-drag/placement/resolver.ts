/**
 * Canonical placement resolution for one library-independent drop input.
 *
 * The resolver receives a {@link DropPlacementInput} built by the pointer and
 * keyboard adapters, so every layout rule below is expressed with Rivto's own
 * geometry and data contracts rather than drag-library event shapes.
 *
 * @module
 */
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
import type { DropPlacementInput } from "./types";
import type { DropPlacement, PointerCoordinates } from "../types";
import { withDropIndicator } from "./indicator";

/**
 * Resolves the insertion line nearest the pointer.
 *
 * A pointer over the row body appends inside that block and highlights it. A
 * pointer in a gap renders a line; horizontal movement then snaps that line to
 * every structurally available depth.
 *
 * @param input - Source and target geometry plus their layout data.
 * @param blocks - Latest complete document tree used to resolve ancestor depth.
 * @param childDropIndent - Horizontal pixels representing one requested depth.
 * @param gapDropZone - Vertical pixels reserved at the top and bottom of a row.
 * @param allowChildPlacement - Global child-placement policy.
 * @param pointer - Live viewport cursor, or null during keyboard movement.
 * @returns A valid candidate destination and indicator, or null when the
 * target cannot receive the source.
 */
export function resolveDropPlacement(
  input: DropPlacementInput,
  blocks: readonly DropBlock[],
  childDropIndent: number,
  gapDropZone: number,
  allowChildPlacement: boolean,
  pointer: PointerCoordinates | null,
): DropPlacement | null {
  const { source, target } = input;
  const indicatorId = target.id;
  // Keyboard movement has no cursor, so the translated source rect stands in
  // for one; its center decides the row half exactly like a pointer would.
  const sourceRect = source.rect;
  const cursorX = pointer
    ? pointer.x
    : sourceRect ? sourceRect.left + sourceRect.width / 2 : target.rect.left;
  const cursorY = pointer
    ? pointer.y
    : sourceRect ? sourceRect.top + sourceRect.height / 2 : target.rect.top;
  let result: DropPlacement | null = null;
  const data = target.data;
  const parentOptions = resolveBlockDropPlacementOptions(
    childDropIndent,
    gapDropZone,
    data?.parentDropPlacement,
    allowChildPlacement,
  );
  const targetOptions = resolveBlockDropPlacementOptions(
    childDropIndent,
    gapDropZone,
    data?.targetDropPlacement,
    allowChildPlacement,
  );
  const parentAllowsChildren = parentOptions.allowChildPlacement
    && data?.parentChildOutline !== "fixed";
  const intent = hitDropIntent({
    reason: data?.hitReason ?? "row",
    parentAxis: data?.sortChildren,
    activeAxis: source.data?.sortChildren,
    targetAcceptsDrop: data?.targetAcceptsDrop === true,
  });
  if (intent === "sibling-edge") {
    // Fixed-outline chrome and document edges are before/after, never inside.
    const edge = resolveChromePlacement(indicatorId, target.rect, cursorY).position;
    result = resolveSiblingEdgePlacement(blocks, indicatorId, edge, undefined, parentOptions.childDropIndent);
  } else if (intent === "inside-field") {
    // An explicitly accepting body receives the drop as a child.
    result = targetOptions.allowChildPlacement
      ? withDropIndicator(resolveInsideDropPlacement(indicatorId), undefined, targetOptions.childDropIndent)
      : null;
  } else if (intent === "axis-horizontal") {
    const edge = cursorX < target.rect.left + target.rect.width / 2 ? "before" : "after";
    result = resolveSiblingEdgePlacement(blocks, indicatorId, edge, "horizontal", parentOptions.childDropIndent);
  } else if (intent === "axis-grid") {
    const placement = resolveGridPlacement(
      indicatorId,
      target.rect,
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
    const edge = cursorY < target.rect.top + target.rect.height / 2 ? "before" : "after";
    result = resolveSiblingEdgePlacement(blocks, indicatorId, edge, "vertical", parentOptions.childDropIndent);
  } else if (pointer) {
    result = resolveGeometryPlacement(
      blocks,
      { id: indicatorId, rect: target.rect },
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
    const after = cursorY >= target.rect.top + target.rect.height / 2;
    if (!after) {
      result = resolveSiblingEdgePlacement(
        blocks,
        indicatorId,
        "before",
        data?.sortChildren,
        parentOptions.childDropIndent,
      );
    } else {
      const placement = resolveAfterDropPlacement(blocks, indicatorId, 0);
      result = withDropIndicator(
        placement,
        data?.sortChildren,
        parentOptions.childDropIndent,
        "after",
      );
    }
  }
  return result?.kind === "between" && pointer ? { ...result, gapPointer: pointer } : result;
}
