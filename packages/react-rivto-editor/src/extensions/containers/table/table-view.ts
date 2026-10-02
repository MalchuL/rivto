/**
 * Table, row, and cell views.
 *
 * Table and row types freeze their structural children (rows and cells). A
 * cell is an outline floor: nested writing blocks indent underneath it, and
 * Enter always creates a child instead of splitting cell text.
 *
 * @module
 */
import { ContainerBlockView } from "../../../views/container-view";
import type { BlockViewContext, BlockViewOutcome, DropAxis } from "../../../views/types";
import type { KeyboardSelectionTarget } from "../../../managers";

export const TABLE_BLOCK_TYPE = "table";
export const TABLE_ROW_BLOCK_TYPE = "table-row";
export const TABLE_CELL_BLOCK_TYPE = "table-cell";

/**
 * Behavior registered for the `table` board type.
 */
export class TableView extends ContainerBlockView {
  override readonly dropChildTypes = [TABLE_ROW_BLOCK_TYPE];
  override readonly dropAxis: DropAxis = "vertical";
}

/**
 * Behavior registered for the `table-row` type.
 */
export class TableRowView extends ContainerBlockView {
  override readonly dropChildTypes = [TABLE_CELL_BLOCK_TYPE];
  override readonly dropParentTypes = [TABLE_BLOCK_TYPE];
  override readonly dropAxis: DropAxis = "horizontal";
}

/**
 * Behavior registered for the `table-cell` type.
 */
export class TableCellView extends ContainerBlockView {
  override readonly dropParentTypes = [TABLE_ROW_BLOCK_TYPE];
  override readonly dropAxis: DropAxis | undefined = undefined;

  /**
   * Always inserts a nested writing block. Shift+Enter stays native because
   * the keyboard binding is plain Enter.
   *
   * @param context - Cell that owns the Enter event.
   * @param _target - Unused caret; cell text is not split.
   * @returns `"handled"` after the child is inserted.
   */
  override onSplit(context: BlockViewContext, _target: KeyboardSelectionTarget): BlockViewOutcome {
    return this.insertFirstChild(context);
  }
}

/** Shared table instance registered by {@link tableExtension}. */
export const tableView = new TableView();

/** Shared row instance registered by {@link tableExtension}. */
export const tableRowView = new TableRowView();

/** Shared cell instance registered by {@link tableExtension}. */
export const tableCellView = new TableCellView();
