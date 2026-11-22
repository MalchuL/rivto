/**
 * Table, row, and cell views.
 *
 * Table and row types freeze their structural children (rows and cells). A
 * cell is an outline floor: nested writing blocks indent underneath it, and
 * Enter always creates a child instead of splitting cell text.
 *
 * @module
 */
import { ContainerHierarchyBehavior } from "../container-hierarchy-behavior";
import type { BlockBehaviorContext, BlockBehaviorOutcome } from "../../../block-behaviors/types";
import type { KeyboardSelectionTarget } from "../../../managers";

export const TABLE_BLOCK_TYPE = "table";
export const TABLE_ROW_BLOCK_TYPE = "table-row";
export const TABLE_CELL_BLOCK_TYPE = "table-cell";

/** Table cells always insert a writing child when Enter is pressed. */
class TableCellBehavior extends ContainerHierarchyBehavior {
  /**
   * Always inserts a nested writing block. Shift+Enter stays native because
   * the keyboard binding is plain Enter.
   *
   * @param context - Cell that owns the Enter event.
   * @param target - Unused caret; cell text is not split.
   * @returns `"handled"` after the child is inserted.
   */
  override onSplit(
    context: BlockBehaviorContext,
    target: KeyboardSelectionTarget,
  ): BlockBehaviorOutcome {
    return this.appendWritingBlock(context);
  }
}

/** Shared table instance registered by {@link tableExtension}; tables accept only rows. */
export const tableBehavior = new ContainerHierarchyBehavior({
  blockType: TABLE_BLOCK_TYPE,
  childType: TABLE_ROW_BLOCK_TYPE,
});

/** Shared row instance registered by {@link tableExtension}; rows hold cells directly below a table. */
export const tableRowBehavior = new ContainerHierarchyBehavior({
  blockType: TABLE_ROW_BLOCK_TYPE,
  parentType: TABLE_BLOCK_TYPE,
  childType: TABLE_CELL_BLOCK_TYPE,
});

/** Shared cell instance registered by {@link tableExtension}; cells stay directly below rows. */
export const tableCellBehavior = new TableCellBehavior({
  blockType: TABLE_CELL_BLOCK_TYPE,
  parentType: TABLE_ROW_BLOCK_TYPE,
});
