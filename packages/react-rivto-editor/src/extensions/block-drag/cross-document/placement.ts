/** Foreign documents use the same regions and acceptance as local dragging. */
import type { EditorBlock } from "@chulane/rivto";
import type { CrossDocumentBlockTransferPlacement } from "../../built-ins/clipboard/cross-document-block-transfer";
import type { ReactEditor } from "../../../types";
import { dropMoveTarget } from "../placement/utils";
import { resolveSurfaceDrop } from "../pointer/target";
import type { DropPlacement } from "../types";

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
