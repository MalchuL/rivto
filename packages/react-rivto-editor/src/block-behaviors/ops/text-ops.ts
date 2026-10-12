/**
 * Text-splitting and merge primitives used by block behaviors.
 *
 * These helpers wrap core `updateBlock`, `insertBlock`, and `mergeBlocks` so
 * Enter and boundary-delete behaviors share one implementation of text splitting at the caret
 * and list-property inheritance.
 *
 * @module
 */
import { createCaretSelection, type EditorBlock } from "@chulane/rivto";
import type { PanelAPI } from "../../panels/types";

/**
 * Slices a block at a caret and inserts a following writing block.
 *
 * The new block inherits list mode from the source when the list extension is
 * active. The caller decides whether the new block should then indent under
 * the source's visible children.
 *
 * @param panel - Editor view providing writing factories and list-prop flags.
 * @param block - Source block whose content is split.
 * @param splitAt - Inclusive UTF-16 offset kept on the source block.
 * @returns Complete inserted block.
 */
export function splitBlockAt(
  panel: PanelAPI,
  block: EditorBlock,
  splitAt: number,
): EditorBlock {
  const listProps = panel.editor.blockListProps.prepareSplit(block);
  const clamped = Math.max(0, Math.min(splitAt, block.content.length));
  const destination = panel.blocks.canRemove(block.id)
    ? panel.blocks.getInsertionDestinationAfter(block.id)
    : { parentId: block.id, beforeId: block.children[0]?.id };
  panel.blocks.updateBlock(block.id, { content: block.content.slice(0, clamped) });
  const nextBlock = panel.blocks.insertBlock({
    ...panel.editor.createDefaultBlock(),
    ...(listProps ? { listProps } : {}),
    content: block.content.slice(clamped),
  }, destination);
  panel.selection.set(createCaretSelection(nextBlock.id, 0));
  return nextBlock;
}

/**
 * Converts an empty non-list block into a list item in place.
 *
 * @param panel - Editor view whose list-prop registration must be active.
 * @param blockId - Empty block to convert.
 * @returns Nothing; the same block keeps the caret.
 */
export function convertEmptyToList(panel: PanelAPI, blockId: string): void {
  panel.blocks.updateBlock(blockId, { listProps: { type: "list", checked: false } });
  panel.selection.set(createCaretSelection(blockId, 0));
}

/**
 * Appends a source block into a surviving target and returns the join offset.
 *
 * @param panel - Editor view owning the core merge command.
 * @param targetId - Block that remains after the merge.
 * @param sourceId - Block transferred and removed.
 * @returns Target content offset where the source text begins.
 */
export function mergeBlocks(
  panel: PanelAPI,
  targetId: string,
  sourceId: string,
): number {
  const joinOffset = panel.blocks.mergeBlocks(targetId, sourceId);
  panel.selection.set(createCaretSelection(targetId, joinOffset));
  return joinOffset;
}

/**
 * Resets a custom block to the host writing type.
 *
 * @param panel - Editor view providing the writing-type factory.
 * @param blockId - Block whose native type is replaced.
 * @returns Nothing; identity is preserved.
 */
export function resetToWritingType(panel: PanelAPI, blockId: string): void {
  panel.blocks.setBlockType(blockId, panel.editor.createDefaultBlock().type);
}
