import type { BlockOutlineContext, BlockBehaviorOutcome } from "../../../block-behaviors/types";
import type { BlockMoveContext } from "../../../block-behaviors/types";
import { canMoveBlockType } from "../../../block-behaviors/utils/move";
import type { BlockBehaviorAvailabilityContext } from "../../../block-behaviors/types";
/**
 * Table, row, and cell views.
 *
 * Table and row types freeze their structural children (rows and cells). A
 * cell is an outline floor: nested writing blocks indent underneath it, and
 * Enter always creates a child instead of splitting cell text.
 *
 * @module
 */
import { ContainerBlockBehavior } from "../../../block-behaviors/container-block-behavior";
import type { BlockBehaviorContext } from "../../../block-behaviors/types";
import type { KeyboardSelectionTarget } from "../../../managers";

export const TABLE_BLOCK_TYPE = "table";
export const TABLE_ROW_BLOCK_TYPE = "table-row";
export const TABLE_CELL_BLOCK_TYPE = "table-cell";

/**
 * Behavior registered for the `table` board type.
 */
export class TableBehavior extends ContainerBlockBehavior {
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
  onChildIndent(context: BlockOutlineContext, ids: readonly string[]): BlockBehaviorOutcome {
    return "rejected";
  }

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
  onChildOutdent(context: BlockOutlineContext, ids: readonly string[]): BlockBehaviorOutcome {
    return "rejected";
  }

  /**
   * Selects this native container independently of the registration's owner.
   * @param context - Current block fields; the registry also supplies each moved source and receiving parent separately.
   * @returns True only for the TABLE_BLOCK_TYPE native type.
   */
  override isAvailable(context: BlockBehaviorAvailabilityContext): boolean {
    return context.block.type === TABLE_BLOCK_TYPE;
  }

  /**
   * Preserves this native shell's parent and child restrictions for any movement input.
   * @param context - Sources and destination with the current receiving parent.
   * @returns Whether this shell permits the requested movement.
   */
  canMove(context: BlockMoveContext): boolean {
    return canMoveBlockType(context, TABLE_BLOCK_TYPE, undefined, [TABLE_ROW_BLOCK_TYPE]);
  }
}

/**
 * Behavior registered for the `table-row` type.
 */
export class TableRowBehavior extends ContainerBlockBehavior {
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
  onChildIndent(context: BlockOutlineContext, ids: readonly string[]): BlockBehaviorOutcome {
    return "rejected";
  }

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
  onChildOutdent(context: BlockOutlineContext, ids: readonly string[]): BlockBehaviorOutcome {
    return "rejected";
  }

  /**
   * Selects this native container independently of the registration's owner.
   * @param context - Current block fields; the registry also supplies each moved source and receiving parent separately.
   * @returns True only for the TABLE_ROW_BLOCK_TYPE native type.
   */
  override isAvailable(context: BlockBehaviorAvailabilityContext): boolean {
    return context.block.type === TABLE_ROW_BLOCK_TYPE;
  }

  /**
   * Preserves this native shell's parent and child restrictions for any movement input.
   * @param context - Sources and destination with the current receiving parent.
   * @returns Whether this shell permits the requested movement.
   */
  canMove(context: BlockMoveContext): boolean {
    return canMoveBlockType(
      context,
      TABLE_ROW_BLOCK_TYPE,
      [TABLE_BLOCK_TYPE],
      [TABLE_CELL_BLOCK_TYPE],
    );
  }
}

/**
 * Behavior registered for the `table-cell` type.
 */
export class TableCellBehavior extends ContainerBlockBehavior {
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
  onChildOutdent(context: BlockOutlineContext, ids: readonly string[]): BlockBehaviorOutcome {
    return "rejected";
  }

  /**
   * Selects this native container independently of the registration's owner.
   * @param context - Current block fields; the registry also supplies each moved source and receiving parent separately.
   * @returns True only for the TABLE_CELL_BLOCK_TYPE native type.
   */
  override isAvailable(context: BlockBehaviorAvailabilityContext): boolean {
    return context.block.type === TABLE_CELL_BLOCK_TYPE;
  }

  /**
   * Keeps moved structural shells inside their native parent type.
   * @param context - Sources and the resolved receiving parent.
   * @returns Whether every shell retains an allowed parent.
   */
  canMove(context: BlockMoveContext): boolean {
    return canMoveBlockType(context, TABLE_CELL_BLOCK_TYPE, [TABLE_ROW_BLOCK_TYPE]);
  }

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

/** Shared table instance registered by {@link tableExtension}. */
export const tableBehavior = new TableBehavior();

/** Shared row instance registered by {@link tableExtension}. */
export const tableRowBehavior = new TableRowBehavior();

/** Shared cell instance registered by {@link tableExtension}. */
export const tableCellBehavior = new TableCellBehavior();
