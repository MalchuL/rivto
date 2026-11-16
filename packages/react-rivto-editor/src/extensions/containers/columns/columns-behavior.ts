import type { BlockStructuralContext, BlockStructuralOutcome } from "@chulane/rivto";
import { createBlockTypeMoveBehavior } from "../block-move-behavior";
import type { BlockInput } from "@chulane/document-model";
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
import type { BlockManagerApi } from "@chulane/rivto";
import { ContainerBlockBehavior } from "../../../block-behaviors/container-block-behavior";

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
  blocks: Pick<BlockManagerApi, "getBlockNode" | "getParentId" | "moveBlocks">,
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

/**
 * Behavior registered for the `columns` board type.
 */
export class ColumnsBehavior extends ContainerBlockBehavior {
  /**
   * Selects this native container independently of the registration's owner.
   * @param context - Current block fields; the registry also supplies each moved source and receiving parent separately.
   * @returns True only for the COLUMNS_BLOCK_TYPE native type.
   */
  override isAvailable(context: BlockInput): boolean {
    return context.type === COLUMNS_BLOCK_TYPE;
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
  override isAvailable(context: BlockInput): boolean {
    return context.type === COLUMNS_COLUMN_BLOCK_TYPE;
  }
}

/**
 * Shared board instance registered by {@link columnsExtension}.
 *
 * Structural movement restrictions for the COLUMNS_BLOCK_TYPE native type.
 */
export const columnsBehavior = Object.assign(
  new ColumnsBehavior(),
  createBlockTypeMoveBehavior(COLUMNS_BLOCK_TYPE, undefined, [COLUMNS_COLUMN_BLOCK_TYPE]),
  {
    /**
     * Preserves the fixed depth of direct structural children.
     *
     * This outline restriction does not prevent independently permitted dragging.
     * The handler rejects the complete requested group before child behavior runs.
     *
     * @param context - Current container fields and the live invoking panel.
     * @param ids - Complete child group requested by the outline operation.
     * @returns Rejected without mutating the document.
     */
    onChildIndent(context: BlockStructuralContext, ids: readonly string[]): BlockStructuralOutcome {
      return "rejected";
    },

    /**
     * Keeps direct children within this container during outline outdent.
     *
     * This outline restriction does not prevent independently permitted dragging.
     * The handler rejects the complete requested group before child behavior runs.
     *
     * @param context - Current container fields and the live invoking panel.
     * @param ids - Complete child group requested by the outline operation.
     * @returns Rejected without mutating the document.
     */
    onChildOutdent(
      context: BlockStructuralContext,
      ids: readonly string[],
    ): BlockStructuralOutcome {
      return "rejected";
    },
  },
);
/**
 * Shared lane instance registered by {@link columnsExtension}.
 *
 * Structural movement restrictions for the COLUMNS_COLUMN_BLOCK_TYPE native type.
 */
export const columnsColumnBehavior = Object.assign(
  new ColumnsColumnBehavior(),
  createBlockTypeMoveBehavior(COLUMNS_COLUMN_BLOCK_TYPE, [COLUMNS_BLOCK_TYPE]),
  {
    /**
     * Keeps direct children within this container during outline outdent.
     *
     * This outline restriction does not prevent independently permitted dragging.
     * The handler rejects the complete requested group before child behavior runs.
     *
     * @param context - Current container fields and the live invoking panel.
     * @param ids - Complete child group requested by the outline operation.
     * @returns Rejected without mutating the document.
     */
    onChildOutdent(
      context: BlockStructuralContext,
      ids: readonly string[],
    ): BlockStructuralOutcome {
      return "rejected";
    },
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
    },
  },
);
