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
import type { EditorViewApi } from "../../editor-view/types";

/**
 * Slices a block at a caret and inserts a following writing block.
 *
 * The new block inherits list mode from the source when the list extension is
 * active. The caller decides whether the new block should then indent under
 * the source's visible children.
 *
 * @param editorView - Editor view providing writing factories and list-prop flags.
 * @param block - Source block whose content is split.
 * @param splitAt - Inclusive UTF-16 offset kept on the source block.
 * @returns Complete inserted block.
 */
export function splitBlockAt(
  editorView: EditorViewApi,
  block: EditorBlock,
  splitAt: number,
): EditorBlock {
  const listProps = editorView.runtime.blockListProps.prepareSplit(block);
  const clamped = Math.max(0, Math.min(splitAt, block.content.length));
  editorView.runtime.blocks.updateBlock(block.id, { content: block.content.slice(0, clamped) });
  const nextBlock = editorView.runtime.blocks.insertBlock({
    ...editorView.runtime.createDefaultBlock(),
    ...(listProps ? { listProps } : {}),
    content: block.content.slice(clamped),
  }, block.id);
  editorView.selection.set(createCaretSelection(nextBlock.id, 0));
  return nextBlock;
}

/**
 * Converts an empty non-list block into a list item in place.
 *
 * @param editorView - Editor view whose list-prop registration must be active.
 * @param blockId - Empty block to convert.
 * @returns Nothing; the same block keeps the caret.
 */
export function convertEmptyToList(editorView: EditorViewApi, blockId: string): void {
  editorView.runtime.blocks.updateBlock(blockId, { listProps: { type: "list", checked: false } });
  editorView.selection.set(createCaretSelection(blockId, 0));
}

/**
 * Appends a source block into a surviving target and returns the join offset.
 *
 * @param editorView - Editor view owning the core merge command.
 * @param targetId - Block that remains after the merge.
 * @param sourceId - Block transferred and removed.
 * @returns Target content offset where the source text begins.
 */
export function mergeBlocks(
  editorView: EditorViewApi,
  targetId: string,
  sourceId: string,
): number {
  const joinOffset = editorView.runtime.blocks.mergeBlocks(targetId, sourceId);
  editorView.selection.set(createCaretSelection(targetId, joinOffset));
  return joinOffset;
}

/**
 * Resets a custom block to the host writing type.
 *
 * @param editorView - Editor view providing the writing-type factory.
 * @param blockId - Block whose native type is replaced.
 * @returns Nothing; identity is preserved.
 */
export function resetToWritingType(editorView: EditorViewApi, blockId: string): void {
  editorView.runtime.blocks.setBlockType(blockId, editorView.runtime.createDefaultBlock().type);
}
