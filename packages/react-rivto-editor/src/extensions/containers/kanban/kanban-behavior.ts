import type { BlockOutlineContext, BlockBehaviorOutcome } from "../../../block-behaviors/types";
import type { BlockMoveContext } from "../../../block-behaviors/types";
import { canMoveBlockType } from "../../../block-behaviors/utils/move";
import type { BlockBehaviorAvailabilityContext } from "../../../block-behaviors/types";
/**
 * Kanban board and column views.
 *
 * The board freezes column outline depth so columns cannot Tab-indent into
 * each other. Each column is an outline floor: cards indent and nest freely,
 * and Shift+Tab cannot lift past the column. Drag may still relocate a card
 * onto the page or into another parent.
 *
 * @module
 */
import { ContainerBlockBehavior } from "../../../block-behaviors/container-block-behavior";

export const KANBAN_BLOCK_TYPE = "kanban";
export const KANBAN_COLUMN_BLOCK_TYPE = "kanban-column";

/**
 * Behavior registered for the `kanban` board type.
 */
export class KanbanBehavior extends ContainerBlockBehavior {
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
   * @returns True only for the KANBAN_BLOCK_TYPE native type.
   */
  override isAvailable(context: BlockBehaviorAvailabilityContext): boolean {
    return context.block.type === KANBAN_BLOCK_TYPE;
  }

  /**
   * Preserves this native shell's parent and child restrictions for any movement input.
   * @param context - Sources and destination with the current receiving parent.
   * @returns Whether this shell permits the requested movement.
   */
  canMove(context: BlockMoveContext): boolean {
    return canMoveBlockType(context, KANBAN_BLOCK_TYPE, undefined, [KANBAN_COLUMN_BLOCK_TYPE]);
  }
}

/**
 * Behavior registered for the `kanban-column` type.
 */
export class KanbanColumnBehavior extends ContainerBlockBehavior {
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
   * @returns True only for the KANBAN_COLUMN_BLOCK_TYPE native type.
   */
  override isAvailable(context: BlockBehaviorAvailabilityContext): boolean {
    return context.block.type === KANBAN_COLUMN_BLOCK_TYPE;
  }

  /**
   * Keeps moved structural shells inside their native parent type.
   * @param context - Sources and the resolved receiving parent.
   * @returns Whether every shell retains an allowed parent.
   */
  canMove(context: BlockMoveContext): boolean {
    return canMoveBlockType(context, KANBAN_COLUMN_BLOCK_TYPE, [KANBAN_BLOCK_TYPE]);
  }
}

/** Shared board instance registered by {@link kanbanExtension}. */
export const kanbanBehavior = new KanbanBehavior();

/** Shared column instance registered by {@link kanbanExtension}. */
export const kanbanColumnBehavior = new KanbanColumnBehavior();
