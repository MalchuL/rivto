import type {
  BlockManagerApi,
  ElementManagerApi,
  HistoryBatch,
  SelectionManagerApi,
} from "../types";
import type { Selection } from "./selection";
import { createCaretSelection, isStructuralSelection } from "./selection-ranges";

/** Document or panel commands used to edit only the selected kinds of content. */
interface SelectionDeletionEditor {
  readonly blocks: Pick<BlockManagerApi, "hasBlock" | "removeBlocks" | "replaceTextSelection">;
  readonly elements: Pick<ElementManagerApi, "removeElements">;
  readonly history: HistoryBatch;
}

/**
 * Deletes the selected content using the caller's block and element boundaries.
 *
 * Structural behaviors may intercept deletion. Text deletion instead joins the
 * surviving prefix and suffix and publishes a collapsed caret in the first block.
 * Element removal joins the same history batch only when elements are selected.
 *
 * @param editor - Document or panel providing mutations and the history batch.
 * @param selection - Shared selection used to resolve ranges and publish the result.
 * @param current - Selection already checked for visibility and root protection by the caller.
 * @returns After updating content and selection, or immediately if no live members exist.
 * @throws If the delegated block, element, or selection operation fails.
 */
export function deleteSelection(
  editor: SelectionDeletionEditor,
  selection: Pick<SelectionManagerApi, "resolveBlockSelection" | "clear" | "set">,
  current: Selection | undefined,
): void {
  if (!current) {
    return;
  }
  const structural = isStructuralSelection(current);
  const range = structural ? undefined : selection.resolveBlockSelection(current);
  const elementIds = current.elements ?? [];
  // Whole-block coverage, or elements with no surviving blocks, must drop
  // those entities rather than splice characters. Element IDs travel with
  // either branch so mixed canvas+page selections stay one undo step.
  if (!range) {
    const blockIds = structural
      ? current.blocks.map(({ id }) => id).filter((id) => editor.blocks.hasBlock(id))
      : [];
    if (!blockIds.length && !elementIds.length) {
      return;
    }
    editor.history.batchUpdates(() => {
      if (blockIds.length && !editor.blocks.removeBlocks(blockIds)) {
        return;
      }
      if (elementIds.length) {
        editor.elements.removeElements(elementIds);
      }
      selection.clear();
    });
  } else {
    // Keep the first block and join the surviving prefix/suffix. Invalid or
    // reversed offsets resolve to an empty slice, so this is still a no-op
    // splice at a clamped caret instead of aborting the transaction.
    const first = range.ranges[0]!;
    const last = range.ranges.at(-1)!;
    const prefix = first.block.content.slice(0, first.startOffset);
    const suffix = last.block.content.slice(last.endOffset);
    editor.history.batchUpdates(() => {
      editor.blocks.replaceTextSelection(
        first.block.id,
        range.blocks.slice(1).map((block) => block.id),
        prefix + suffix,
      );
      if (elementIds.length) {
        editor.elements.removeElements(elementIds);
      }
      selection.set(createCaretSelection(first.block.id, prefix.length));
    });
  }
}
