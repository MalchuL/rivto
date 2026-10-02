/** Foreign documents use the same regions and acceptance as local dragging. */
import type { EditorBlock } from "@chulane/rivto";
import type { CrossDocumentBlockTransferPlacement } from "../../built-ins/clipboard/cross-document-block-transfer";
import type { ReactEditor } from "../../../types";
import { dropMoveTarget } from "../placement/utils";
import { resolveSurfaceDrop } from "../pointer/target";
import type { DropPlacement } from "../types";

/**
 * Resolves a foreign-document drop into a destination page's move target.
 *
 * Uses the same rendered regions and view acceptance as local dragging. An
 * empty document accepts a root-level append without a block indicator;
 * populated documents translate the resolved canonical placement into a target.
 *
 * @param reactEditor - Destination React runtime providing its tree and block views.
 * @param root - Rendered destination page surface.
 * @param x - Pointer's horizontal viewport coordinate in pixels.
 * @param y - Pointer's vertical viewport coordinate in pixels.
 * @param childDropIndent - Default pixels per requested outline depth change.
 * @param gapDropZone - Default item-edge zone for sibling placement in pixels.
 * @param allowChildPlacement - Default policy permitting child placement.
 * @param sources - Foreign source blocks validated by the destination views.
 * @param outerEdgeDropZone - Optional container-edge sibling zone in pixels; defaults to 8.
 * @returns Accepted transfer target and visual placement, with a `null` indicator
 * for an empty document, or `null` when no destination is accepted.
 */
export function resolveCrossDocumentPageRootPlacement(
  reactEditor: ReactEditor,
  root: HTMLElement,
  x: number,
  y: number,
  childDropIndent: number,
  gapDropZone: number,
  allowChildPlacement: boolean,
  sources: readonly EditorBlock[],
  outerEdgeDropZone?: number,
): (CrossDocumentBlockTransferPlacement & { readonly indicator: DropPlacement | null }) | null {
  const blocks = reactEditor.blocks.getBlocks();
  if (!blocks.length) {
    const destination = { kind: "between", parentId: null, previousId: null, nextId: null, depth: 0 } as const;
    return reactEditor.views.acceptsDrop(destination, sources) ? { targetId: null, position: "after", indicator: null } : null;
  }
  const indicator = resolveSurfaceDrop(root, reactEditor, sources, blocks, { x, y }, {
    childDropIndent, gapDropZone, allowChildPlacement, outerEdgeDropZone,
  });
  return indicator ? { ...dropMoveTarget(indicator), indicator } : null;
}
