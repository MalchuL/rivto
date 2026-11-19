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
import type {
  BlockRelocationCommands,
  BlockStructuralContext,
  BlockStructuralOutcome,
} from "@chulane/rivto";
import { ContainerHierarchyBehavior } from "../container-hierarchy-behavior";

export const COLUMNS_BLOCK_TYPE = "columns";
export const COLUMNS_COLUMN_BLOCK_TYPE = "columns-column";

/**
 * Moves nested blocks out of columns that are about to disappear.
 *
 * Remaining sibling columns receive the children, appended in source order.
 * When every column of a board is removed, children are placed after the board
 * so they stay in the document instead of being deleted with the shells.
 *
 * @param blocks - Document block operations owning the block tree.
 * @param columnIds - Column identifiers whose children must survive.
 * @returns Nothing; callers delete the empty shells afterwards.
 */
export function relocateColumnContents(
  blocks: BlockRelocationCommands,
  columnIds: readonly string[],
): void {
  const unique = [...new Set(columnIds)].filter(
    (id) => blocks.getBlockNode(id)?.type === COLUMNS_COLUMN_BLOCK_TYPE,
  );
  unique.forEach((id) => {
    const parentId = blocks.getParentId(id);
    if (!parentId || blocks.getBlockNode(parentId)?.type !== COLUMNS_BLOCK_TYPE) {
      return;
    }
    const keep = (blocks.getBlockNode(parentId)?.childIds ?? []).filter(
      (childId) =>
        blocks.getBlockNode(childId)?.type === COLUMNS_COLUMN_BLOCK_TYPE &&
        !unique.includes(childId),
    );
    const childIds = blocks.getBlockNode(id)?.childIds ?? [];
    if (!childIds.length) {
      return;
    }
    if (keep.length) {
      blocks.moveBlocks([...childIds], keep.at(-1)!, "inside");
    } else {
      blocks.moveBlocks([...childIds], parentId, "after");
    }
  });
}

/** Keeps the removed columns’ contents in the surrounding document. */
class ColumnsColumnBehavior extends ContainerHierarchyBehavior {
  /**
   * Relocates lane contents so a structural delete does not drop nested blocks.
   *
   * @param context - One selected column whose view was resolved.
   * @param ids - Complete structural selection about to be removed.
   * @returns `"unhandled"` so the shared deletion path still removes the shells.
   */
  onStructuralDelete(
    context: BlockStructuralContext,
    ids: readonly string[],
  ): BlockStructuralOutcome {
    const columnIds = ids.filter(
      (id) => context.blocks.getBlockNode(id)?.type === context.block.type,
    );
    if (columnIds.length) {
      relocateColumnContents(context.documentBlocks, columnIds);
    }
    return "unhandled";
  }
}

/** Shared board instance registered by {@link columnsExtension}; boards accept only column lanes. */
export const columnsBehavior = new ContainerHierarchyBehavior({
  blockType: COLUMNS_BLOCK_TYPE,
  childType: COLUMNS_COLUMN_BLOCK_TYPE,
});

/** Shared lane instance registered by {@link columnsExtension}; each lane stays directly below its board. */
export const columnsColumnBehavior = new ColumnsColumnBehavior({
  blockType: COLUMNS_COLUMN_BLOCK_TYPE,
  parentType: COLUMNS_BLOCK_TYPE,
});
