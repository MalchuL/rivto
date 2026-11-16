import type { BlockStructuralContext, BlockStructuralOutcome } from "@chulane/rivto";
import { createBlockTypeMoveBehavior } from "../block-move-behavior";
import type { BlockInput } from "@chulane/document-model";
/**
 * Kanban board and column views.
 *
 * The board freezes column outline depth so columns cannot Tab-indent into
 * each other. Each column is an outline floor: card keyboard indentation remains available,
 * and Shift+Tab cannot lift past the column. Drag may still relocate a card
 * onto the page or into another parent. Card edges offer sibling placement;
 * inside targets and nested child lists retain their own behavior.
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
   * Selects this native container independently of the registration's owner.
   * @param context - Current block fields; the registry also supplies each moved source and receiving parent separately.
   * @returns True only for the KANBAN_BLOCK_TYPE native type.
   */
  override isAvailable(context: BlockInput): boolean {
    return context.type === KANBAN_BLOCK_TYPE;
  }
}

/**
 * Behavior registered for the `kanban-column` type.
 */
export class KanbanColumnBehavior extends ContainerBlockBehavior {
  /**
   * Keeps card boundary drops at the column's direct-child level.
   *
   * @returns Sibling-only boundary placement without restricting inside drops.
   */
  childDropPlacement(): "siblings" {
    return "siblings";
  }

  /**
   * Selects this native container independently of the registration's owner.
   * @param context - Current block fields; the registry also supplies each moved source and receiving parent separately.
   * @returns True only for the KANBAN_COLUMN_BLOCK_TYPE native type.
   */
  override isAvailable(context: BlockInput): boolean {
    return context.type === KANBAN_COLUMN_BLOCK_TYPE;
  }
}

/**
 * Shared board instance registered by {@link kanbanExtension}.
 *
 * Structural movement restrictions for the KANBAN_BLOCK_TYPE native type.
 */
export const kanbanBehavior = Object.assign(
  new KanbanBehavior(),
  createBlockTypeMoveBehavior(KANBAN_BLOCK_TYPE, undefined, [KANBAN_COLUMN_BLOCK_TYPE]),
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
 * Shared column instance registered by {@link kanbanExtension}.
 *
 * Structural movement restrictions for the KANBAN_COLUMN_BLOCK_TYPE native type.
 */
export const kanbanColumnBehavior = Object.assign(
  new KanbanColumnBehavior(),
  createBlockTypeMoveBehavior(KANBAN_COLUMN_BLOCK_TYPE, [KANBAN_BLOCK_TYPE]),
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
