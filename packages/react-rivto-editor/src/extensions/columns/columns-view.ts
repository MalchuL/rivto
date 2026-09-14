/**
 * Columns board and lane views.
 *
 * The board freezes column-shell outline depth. Each lane is an outline floor
 * so writing blocks indent underneath it but cannot Shift+Tab past the lane.
 * Drag may still relocate writing onto the page. Structural deletion relocates
 * lane children before the shells disappear.
 *
 * @module
 */
import { ContainerBlockView } from "../../views/container-view";
import type { RivtoEditorApi } from "@chulane/rivto";
import type { BlockViewContext, BlockViewOutcome, DropAxis } from "../../views/types";

export const COLUMNS_BLOCK_TYPE = "columns";
export const COLUMNS_COLUMN_BLOCK_TYPE = "columns-column";

/**
 * Moves nested blocks out of columns that are about to disappear.
 *
 * Remaining sibling columns receive the children, appended in source order.
 * When every column of a board is removed, children are placed after the board
 * so they stay in the document instead of being deleted with the shells.
 *
 * @param editor - Core editor owning the block tree.
 * @param columnIds - Column identifiers whose children must survive.
 * @returns Nothing; callers delete the empty shells afterwards.
 */
export function relocateColumnContents(editor: RivtoEditorApi, columnIds: readonly string[]): void {
  const unique = [...new Set(columnIds)].filter((id) => editor.blocks.getBlock(id)?.type === COLUMNS_COLUMN_BLOCK_TYPE);
  unique.forEach((id) => {
    const parentId = editor.blocks.getParentId(id);
    const parent = parentId ? editor.blocks.getBlock(parentId) : undefined;
    if (!parentId || parent?.type !== COLUMNS_BLOCK_TYPE) return;
    const keep = parent.children.filter((child) => child.type === COLUMNS_COLUMN_BLOCK_TYPE && !unique.includes(child.id));
    const childIds = editor.blocks.getBlock(id)?.children.map((child) => child.id) ?? [];
    if (!childIds.length) return;
    if (keep.length) editor.blocks.moveBlocks(childIds, keep.at(-1)!.id, "inside");
    else editor.blocks.moveBlocks(childIds, parentId, "after");
  });
}

/**
 * Behavior registered for the `columns` board type.
 */
export class ColumnsView extends ContainerBlockView {
  override readonly dropAxis: DropAxis | undefined = undefined;
  override readonly acceptsDropContainer: boolean = false;
}

/**
 * Behavior registered for the `columns-column` lane type.
 */
export class ColumnsColumnView extends ContainerBlockView {
  override readonly dropAxis: DropAxis | undefined = undefined;

  /**
   * Relocates lane contents so a structural delete does not drop nested blocks.
   *
   * @param context - One selected column whose view was resolved.
   * @param ids - Complete structural selection about to be removed.
   * @returns `"default"` so the shared deletion path still removes the shells.
   */
  override onStructuralDelete(context: BlockViewContext, ids: readonly string[]): BlockViewOutcome {
    const columnIds = ids.filter((id) => (
      context.reactEditor.editor.blocks.getBlock(id)?.type === context.block.type
    ));
    if (columnIds.length) relocateColumnContents(context.reactEditor.editor, columnIds);
    return "default";
  }
}

/** Shared board instance registered by {@link columnsExtension}. */
export const columnsView = new ColumnsView();

/** Shared lane instance registered by {@link columnsExtension}. */
export const columnsColumnView = new ColumnsColumnView();
