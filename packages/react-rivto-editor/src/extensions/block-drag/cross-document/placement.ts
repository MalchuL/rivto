/** Canonical destination resolution for cross-document page drops. */
import type { CrossDocumentBlockTransferPlacement } from "../../built-ins/clipboard/cross-document-block-transfer";
import type { ReactEditor } from "../../../types";
import {
  dropMoveTarget,
  resolveBlockDropPlacementOptions,
} from "../placement/utils";
import { blockContainment } from "../utils/containment";
import { closestPageRow, resolveGeometryPlacement } from "../placement/geometry";
import type { DropPlacement } from "../types";

const PAGE_BLOCK_SELECTOR = "[data-block-id]";
const PAGE_BLOCK_ROW_SELECTOR = ":scope > .page-block-row";

export function resolveCrossDocumentPageRootPlacement(
  reactEditor: ReactEditor,
  root: HTMLElement,
  x: number,
  y: number,
  childDropIndent: number,
  gapDropZone: number,
  allowChildPlacement: boolean,
): (CrossDocumentBlockTransferPlacement & { readonly indicator: DropPlacement | null }) | null {
  const rows = [...root.querySelectorAll<HTMLElement>("[data-block-id]")].flatMap((block) => {
    const row = block.querySelector<HTMLElement>(PAGE_BLOCK_ROW_SELECTOR);
    const id = block.dataset.blockId;
    return row && id ? [{ id, rect: row.getBoundingClientRect() }] : [];
  });
  let result: (CrossDocumentBlockTransferPlacement & { readonly indicator: DropPlacement | null }) | null = null;
  if (rows.length === 0) {
    result = { targetId: null, position: "after", indicator: null };
  } else {
    const row = closestPageRow(rows, y);
    if (row) {
      const targetElement = root.querySelector<HTMLElement>(`[data-block-id="${CSS.escape(row.id)}"]`);
      const parentId = targetElement?.parentElement?.closest<HTMLElement>(PAGE_BLOCK_SELECTOR)?.dataset.blockId;
      const parentOptions = resolveBlockDropPlacementOptions(
        childDropIndent,
        gapDropZone,
        parentId ? reactEditor.views.resolve(parentId).dropPlacement : undefined,
        allowChildPlacement,
      );
      const targetOptions = resolveBlockDropPlacementOptions(
        childDropIndent,
        gapDropZone,
        reactEditor.views.resolve(row.id).dropPlacement,
        allowChildPlacement,
      );
      const indicator = resolveGeometryPlacement(
        reactEditor.blocks.getBlocks(),
        row,
        x,
        y,
        {
          ...parentOptions,
          allowChildPlacement: parentOptions.allowChildPlacement
            && targetOptions.allowChildPlacement
            && (!parentId || blockContainment(reactEditor, parentId)?.childOutline !== "fixed"),
        },
      );
      const renderedIndicator = indicator?.kind === "between"
        ? { ...indicator, gapPointer: { x, y } }
        : indicator;
      const target = renderedIndicator ? dropMoveTarget(renderedIndicator) : null;
      result = target && renderedIndicator ? { ...target, indicator: renderedIndicator } : null;
    }
  }
  return result;
}
