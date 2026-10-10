/**
 * Builds the snapshot a behavior method receives from a page dispatcher.
 *
 * @module
 */
import type { Selection } from "@chulane/rivto";
import type { EditorViewApi } from "../editor-view/types";
import type { BlockBehaviorContext } from "./types";

/**
 * Resolves a live block into a behavior context, or `undefined` when it is missing.
 *
 * @param editorView - Editor view providing the document and selection.
 * @param blockId - Placed block whose behavior will run.
 * @param root - Active surface or edgeless card.
 * @param selection - Portable selection captured for this event.
 * @returns Context for that block, or `undefined` when it is unplaced.
 */
export function createBlockBehaviorContext(
  editorView: EditorViewApi,
  blockId: string,
  root: HTMLElement,
  selection?: Selection,
): BlockBehaviorContext | undefined {
  const block = editorView.runtime.blocks.getBlock(blockId);
  if (!block) return undefined;
  return {
    editorView,
    block,
    parentId: editorView.runtime.blocks.getParentId(block.id) ?? null,
    selection,
    root,
  };
}
