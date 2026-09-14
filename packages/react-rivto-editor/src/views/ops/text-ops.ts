/**
 * Text-splitting and merge primitives used by block views.
 *
 * These helpers wrap core `updateBlock`, `insertBlock`, and `mergeBlocks` so
 * Enter and boundary-delete views share one implementation of caret slicing
 * and list-property inheritance.
 *
 * @module
 */
import { createCaretSelection, type EditorBlock } from "@chulane/rivto";
import { isNumberedListType } from "../../extensions/built-ins/page/list";
import type { ReactEditor } from "../../types";

/**
 * Slices a block at a caret and inserts a following writing block.
 *
 * The new block inherits list mode from the source when the list extension is
 * active. The caller decides whether the new block should then indent under
 * the source's visible children.
 *
 * @param reactEditor - Runtime providing writing factories and list-prop flags.
 * @param block - Source block whose content is split.
 * @param splitAt - Inclusive UTF-16 offset kept on the source block.
 * @returns Identifier of the inserted following block.
 */
export function splitBlockAt(
  reactEditor: ReactEditor,
  block: EditorBlock,
  splitAt: number,
): string {
  const { editor } = reactEditor;
  const listActive = reactEditor.blocks.hasListProps("list");
  const clamped = Math.max(0, Math.min(splitAt, block.content.length));
  editor.blocks.updateBlock(block.id, { content: block.content.slice(0, clamped) });
  const nextBlockId = reactEditor.blocks.insertBlock({
    ...reactEditor.createDefaultBlock(),
    ...(listActive ? { listProps: {
      type: block.listProps.type === "checkbox"
        ? "checkbox"
        : isNumberedListType(block.listProps.type) ? "numbered_list" : "list",
      checked: false,
    } } : {}),
    content: block.content.slice(clamped),
  }, block.id);
  reactEditor.selection.set(createCaretSelection(nextBlockId, 0));
  return nextBlockId;
}

/**
 * Converts an empty non-list block into a list item in place.
 *
 * @param reactEditor - Runtime whose list-prop registration must be active.
 * @param blockId - Empty block to convert.
 * @returns Nothing; the same block keeps the caret.
 */
export function convertEmptyToList(reactEditor: ReactEditor, blockId: string): void {
  reactEditor.blocks.updateBlock(blockId, { listProps: { type: "list", checked: false } });
  reactEditor.selection.set(createCaretSelection(blockId, 0));
}

/**
 * Appends a source block into a surviving target and returns the join offset.
 *
 * @param reactEditor - Runtime owning the core merge command.
 * @param targetId - Block that remains after the merge.
 * @param sourceId - Block transferred and removed.
 * @returns Target content offset where the source text begins.
 */
export function mergeBlocks(
  reactEditor: ReactEditor,
  targetId: string,
  sourceId: string,
): number {
  const joinOffset = reactEditor.editor.blocks.mergeBlocks(targetId, sourceId);
  reactEditor.selection.set(createCaretSelection(targetId, joinOffset));
  return joinOffset;
}

/**
 * Resets a custom block to the host writing type.
 *
 * @param reactEditor - Runtime providing the writing-type factory.
 * @param blockId - Block whose native type is replaced.
 * @returns Nothing; identity is preserved.
 */
export function resetToWritingType(reactEditor: ReactEditor, blockId: string): void {
  reactEditor.editor.blocks.setBlockType(blockId, reactEditor.createDefaultBlock().type);
}
