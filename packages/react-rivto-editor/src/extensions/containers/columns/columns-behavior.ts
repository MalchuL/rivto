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
import type { RivtoEditorApi } from "@chulane/rivto";
import { ContainerBlockBehavior } from "../../../block-behaviors/container-block-behavior";
import type { BlockBehaviorContext, BlockBehaviorOutcome, DropAxis } from "../../../block-behaviors/types";
import type { EditorViewApi } from "../../../editor-view/types";

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
export function relocateColumnContents(editor: EditorViewApi | RivtoEditorApi, columnIds: readonly string[]): void {
  const documentEditor = "runtime" in editor ? editor.runtime : editor;
  const unique = [...new Set(columnIds)].filter((id) => documentEditor.blocks.getBlockNode(id)?.type === COLUMNS_COLUMN_BLOCK_TYPE);
  unique.forEach((id) => {
    const parentId = documentEditor.blocks.getParentId(id);
    if (!parentId || documentEditor.blocks.getBlockNode(parentId)?.type !== COLUMNS_BLOCK_TYPE) return;
    const keep = (documentEditor.blocks.getBlockNode(parentId)?.childIds ?? []).filter((childId) => (
      documentEditor.blocks.getBlockNode(childId)?.type === COLUMNS_COLUMN_BLOCK_TYPE && !unique.includes(childId)
    ));
    const childIds = documentEditor.blocks.getBlockNode(id)?.childIds ?? [];
    if (!childIds.length) return;
    if (keep.length) documentEditor.blocks.moveBlocks([...childIds], keep.at(-1)!, "inside");
    else documentEditor.blocks.moveBlocks([...childIds], parentId, "after");
  });
}

/**
 * Behavior registered for the `columns` board type.
 */
export class ColumnsBehavior extends ContainerBlockBehavior {
  override readonly dropChildTypes = [COLUMNS_COLUMN_BLOCK_TYPE];
  override readonly dropAxis: DropAxis = "horizontal";
  override readonly acceptsDropContainer: boolean = false;
}

/**
 * Behavior registered for the `columns-column` lane type.
 */
export class ColumnsColumnBehavior extends ContainerBlockBehavior {
  override readonly dropParentTypes = [COLUMNS_BLOCK_TYPE];
  override readonly dropAxis: DropAxis | undefined = undefined;

  /**
   * Relocates lane contents so a structural delete does not drop nested blocks.
   *
   * @param context - One selected column whose view was resolved.
   * @param ids - Complete structural selection about to be removed.
   * @returns `"default"` so the shared deletion path still removes the shells.
   */
  override onStructuralDelete(context: BlockBehaviorContext, ids: readonly string[]): BlockBehaviorOutcome {
    const columnIds = ids.filter((id) => (
      context.editorView.runtime.blocks.getBlockNode(id)?.type === context.block.type
    ));
    if (columnIds.length) relocateColumnContents(context.editorView, columnIds);
    return "default";
  }
}

/** Shared board instance registered by {@link columnsExtension}. */
export const columnsBehavior = new ColumnsBehavior();

/** Shared lane instance registered by {@link columnsExtension}. */
export const columnsColumnBehavior = new ColumnsColumnBehavior();
