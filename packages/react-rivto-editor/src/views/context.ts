/**
 * Builds the snapshot a view method receives from a page dispatcher.
 *
 * @module
 */
import type { Selection } from "@chulane/rivto";
import type { ReactEditor } from "../types";
import type { BlockViewContext } from "./types";

/**
 * Resolves a live block into a view context, or `undefined` when it is missing.
 *
 * @param reactEditor - Runtime providing the document and selection.
 * @param blockId - Placed block whose view will run.
 * @param root - Active surface or edgeless card.
 * @param selection - Portable selection captured for this event.
 * @returns Context for that block, or `undefined` when it is unplaced.
 */
export function createBlockViewContext(
  reactEditor: ReactEditor,
  blockId: string,
  root: HTMLElement,
  selection?: Selection,
): BlockViewContext | undefined {
  const block = reactEditor.blocks.getBlock(blockId);
  if (!block) return undefined;
  return {
    reactEditor,
    block,
    parentId: reactEditor.blocks.getParentId(block.id) ?? null,
    selection,
    root,
  };
}
