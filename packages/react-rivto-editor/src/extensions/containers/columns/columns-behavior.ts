import type { BlockMoveContext } from "../../../block-behaviors/types";
import { canMoveBlockType } from "../../../block-behaviors/utils/move";
import type { BlockBehaviorAvailabilityContext } from "../../../block-behaviors/types";
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
import type { DocumentEditorAPI } from "@chulane/rivto";
import { ContainerBlockBehavior } from "../../../block-behaviors/container-block-behavior";
import type { BlockBehaviorContext, BlockBehaviorOutcome } from "../../../block-behaviors/types";
import type { ReactPanelApi } from "../../../panels/types";

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
export function relocateColumnContents(
  editor: ReactPanelApi | DocumentEditorAPI,
  columnIds: readonly string[],
): void {
  const documentEditor = "editor" in editor ? editor.document : editor;
  const unique = [...new Set(columnIds)].filter(
    (id) => documentEditor.blocks.getBlockNode(id)?.type === COLUMNS_COLUMN_BLOCK_TYPE,
  );
  unique.forEach((id) => {
    const parentId = documentEditor.blocks.getParentId(id);
    if (!parentId || documentEditor.blocks.getBlockNode(parentId)?.type !== COLUMNS_BLOCK_TYPE) {
      return;
    }
    const keep = (documentEditor.blocks.getBlockNode(parentId)?.childIds ?? []).filter(
      (childId) =>
        documentEditor.blocks.getBlockNode(childId)?.type === COLUMNS_COLUMN_BLOCK_TYPE &&
        !unique.includes(childId),
    );
    const childIds = documentEditor.blocks.getBlockNode(id)?.childIds ?? [];
    if (!childIds.length) {
      return;
    }
    if (keep.length) {
      documentEditor.blocks.moveBlocks([...childIds], keep.at(-1)!, "inside");
    } else {
      documentEditor.blocks.moveBlocks([...childIds], parentId, "after");
    }
  });
}

/**
 * Behavior registered for the `columns` board type.
 */
export class ColumnsBehavior extends ContainerBlockBehavior {
  /**
   * Selects this native container independently of the registration's owner.
   * @param context - Current block fields; the registry also supplies each moved source and receiving parent separately.
   * @returns True only for the COLUMNS_BLOCK_TYPE native type.
   */
  override isAvailable(context: BlockBehaviorAvailabilityContext): boolean {
    return context.block.type === COLUMNS_BLOCK_TYPE;
  }

  /**
   * Preserves this native shell's parent and child restrictions for any movement input.
   * @param context - Sources and destination with the current receiving parent.
   * @returns Whether this shell permits the requested movement.
   */
  canMove(context: BlockMoveContext): boolean {
    return canMoveBlockType(context, COLUMNS_BLOCK_TYPE, undefined, [COLUMNS_COLUMN_BLOCK_TYPE]);
  }
}

/**
 * Behavior registered for the `columns-column` lane type.
 */
export class ColumnsColumnBehavior extends ContainerBlockBehavior {
  /**
   * Selects this native container independently of the registration's owner.
   * @param context - Current block fields; the registry also supplies each moved source and receiving parent separately.
   * @returns True only for the COLUMNS_COLUMN_BLOCK_TYPE native type.
   */
  override isAvailable(context: BlockBehaviorAvailabilityContext): boolean {
    return context.block.type === COLUMNS_COLUMN_BLOCK_TYPE;
  }

  /**
   * Keeps moved structural shells inside their native parent type.
   * @param context - Sources and the resolved receiving parent.
   * @returns Whether every shell retains an allowed parent.
   */
  canMove(context: BlockMoveContext): boolean {
    return canMoveBlockType(context, COLUMNS_COLUMN_BLOCK_TYPE, [COLUMNS_BLOCK_TYPE]);
  }

  /**
   * Relocates lane contents so a structural delete does not drop nested blocks.
   *
   * @param context - One selected column whose view was resolved.
   * @param ids - Complete structural selection about to be removed.
   * @returns `"default"` so the shared deletion path still removes the shells.
   */
  onStructuralDelete(context: BlockBehaviorContext, ids: readonly string[]): BlockBehaviorOutcome {
    const columnIds = ids.filter(
      (id) => context.reactPanel.blocks.getBlockNode(id)?.type === context.block.type,
    );
    if (columnIds.length) {
      relocateColumnContents(context.reactPanel, columnIds);
    }
    return "default";
  }
}

/** Shared board instance registered by {@link columnsExtension}. */
export const columnsBehavior = new ColumnsBehavior();

/** Shared lane instance registered by {@link columnsExtension}. */
export const columnsColumnBehavior = new ColumnsColumnBehavior();
