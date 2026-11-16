import type { BlockStructuralContext, BlockStructuralOutcome } from "@chulane/rivto";
import { createBlockTypeMoveBehavior } from "../block-move-behavior";
import type { BlockInput } from "@chulane/document-model";
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
import type { BlockBehaviorOutcome } from "../../../block-behaviors/types";
import type { KeyboardSelectionTarget } from "../../../managers";

export const TABLE_BLOCK_TYPE = "table";
export const TABLE_ROW_BLOCK_TYPE = "table-row";
export const TABLE_CELL_BLOCK_TYPE = "table-cell";

/**
 * Behavior registered for the `table` board type.
 */
export class TableBehavior extends ContainerBlockBehavior {
  /**
   * Selects this native container independently of the registration's owner.
   * @param context - Current block fields; the registry also supplies each moved source and receiving parent separately.
   * @returns True only for the TABLE_BLOCK_TYPE native type.
   */
  override isAvailable(context: BlockInput): boolean {
    return context.type === TABLE_BLOCK_TYPE;
  }
}

/**
 * Behavior registered for the `table-row` type.
 */
export class TableRowBehavior extends ContainerBlockBehavior {
  /**
   * Selects this native container independently of the registration's owner.
   * @param context - Current block fields; the registry also supplies each moved source and receiving parent separately.
   * @returns True only for the TABLE_ROW_BLOCK_TYPE native type.
   */
  override isAvailable(context: BlockInput): boolean {
    return context.type === TABLE_ROW_BLOCK_TYPE;
  }
}

/**
 * Behavior registered for the `table-cell` type.
 */
export class TableCellBehavior extends ContainerBlockBehavior {
  /**
   * Selects this native container independently of the registration's owner.
   * @param context - Current block fields; the registry also supplies each moved source and receiving parent separately.
   * @returns True only for the TABLE_CELL_BLOCK_TYPE native type.
   */
  override isAvailable(context: BlockInput): boolean {
    return context.type === TABLE_CELL_BLOCK_TYPE;
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

/**
 * Shared table instance registered by {@link tableExtension}.
 *
 * Structural movement restrictions for the TABLE_BLOCK_TYPE native type.
 */
export const tableBehavior = Object.assign(
  new TableBehavior(),
  createBlockTypeMoveBehavior(TABLE_BLOCK_TYPE, undefined, [TABLE_ROW_BLOCK_TYPE]),
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
 * Shared row instance registered by {@link tableExtension}.
 *
 * Structural movement restrictions for the TABLE_ROW_BLOCK_TYPE native type.
 */
export const tableRowBehavior = Object.assign(
  new TableRowBehavior(),
  createBlockTypeMoveBehavior(TABLE_ROW_BLOCK_TYPE, [TABLE_BLOCK_TYPE], [TABLE_CELL_BLOCK_TYPE]),
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
 * Shared cell instance registered by {@link tableExtension}.
 *
 * Structural movement restrictions for the TABLE_CELL_BLOCK_TYPE native type.
 */
export const tableCellBehavior = Object.assign(
  new TableCellBehavior(),
  createBlockTypeMoveBehavior(TABLE_CELL_BLOCK_TYPE, [TABLE_ROW_BLOCK_TYPE]),
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
  },
);
