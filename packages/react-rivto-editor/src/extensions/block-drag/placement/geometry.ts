/** Geometry-based canonical placement for page drag targets. */
import type { DropAxis } from "../../../views/types";
import {
  resolveAfterDropPlacement,
  resolveBeforeDropPlacement,
  resolveInsideDropPlacement,
  resolveSiblingAfterDropPlacement,
  type DropBlock,
  type ResolvedDropPlacementOptions,
} from "./utils";
import type { DropPlacement, RowGeometry } from "../types";
import { withDropIndicator } from "./indicator";

export function closestPageRow(rows: readonly RowGeometry[], y: number): RowGeometry | undefined {
  const hovered = rows
    .filter(({ rect }) => y >= rect.top && y <= rect.bottom)
    .sort((left, right) => Math.abs(y - (left.rect.top + left.rect.height / 2))
      - Math.abs(y - (right.rect.top + right.rect.height / 2)))[0];
  const preceding = rows
    .filter(({ rect }) => rect.bottom < y)
    .sort((left, right) => right.rect.bottom - left.rect.bottom)[0];
  const following = [...rows].sort((left, right) => left.rect.top - right.rect.top)[0];
  return hovered ?? preceding ?? following;
}

export function resolveGeometryPlacement(
  blocks: readonly DropBlock[],
  row: RowGeometry,
  cursorX: number,
  cursorY: number,
  options: ResolvedDropPlacementOptions,
): DropPlacement | null {
  const edgeSize = Math.min(options.gapDropZone, row.rect.height / 3);
  let result: DropPlacement | null = null;
  const inside = cursorY >= row.rect.top + edgeSize && cursorY <= row.rect.bottom - edgeSize;
  if (inside && options.allowChildPlacement) {
    result = withDropIndicator(resolveInsideDropPlacement(row.id), undefined, options.childDropIndent);
  } else if (cursorY < row.rect.top + row.rect.height / 2) {
    result = withDropIndicator(
      resolveBeforeDropPlacement(blocks, row.id),
      undefined,
      options.childDropIndent,
      "before",
    );
  } else {
    const depthOffset = Math.floor((cursorX - row.rect.left) / options.childDropIndent);
    const placement = resolveAfterDropPlacement(blocks, row.id, depthOffset);
    result = withDropIndicator(placement, undefined, options.childDropIndent, "after");
  }
  return result;
}

/**
 * Resolves one item half to the canonical neighboring sibling gap.
 *
 * @param blocks - Complete document forest.
 * @param blockId - Item whose leading or trailing half was chosen.
 * @param edge - Chosen item edge.
 * @param layoutAxis - Destination sibling layout.
 * @param childDropIndent - Visual offset represented by one child depth.
 * @returns Renderable canonical gap.
 */
export function resolveSiblingEdgePlacement(
  blocks: readonly DropBlock[],
  blockId: string,
  edge: "before" | "after",
  layoutAxis: DropAxis | undefined,
  childDropIndent: number,
): DropPlacement | null {
  const placement = edge === "before"
    ? resolveBeforeDropPlacement(blocks, blockId)
    : resolveSiblingAfterDropPlacement(blocks, blockId);
  return withDropIndicator(placement, layoutAxis, childDropIndent, edge);
}
