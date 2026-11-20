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
import { ContainerHierarchyBehavior } from "../container-hierarchy-behavior";

export const KANBAN_BLOCK_TYPE = "kanban";
export const KANBAN_COLUMN_BLOCK_TYPE = "kanban-column";

/** Kanban columns keep card edge drops at their direct-child level. */
class KanbanColumnBehavior extends ContainerHierarchyBehavior {
  /**
   * Keeps card boundary drops at the column's direct-child level.
   *
   * @returns Sibling-only boundary placement without restricting inside drops.
   */
  childDropPlacement(): "siblings" {
    return "siblings";
  }
}

/** Shared board instance registered by {@link kanbanExtension}; boards accept only Kanban columns. */
export const kanbanBehavior = new ContainerHierarchyBehavior({
  blockType: KANBAN_BLOCK_TYPE,
  childType: KANBAN_COLUMN_BLOCK_TYPE,
});

/** Shared column instance registered by {@link kanbanExtension}; columns stay directly below the board. */
export const kanbanColumnBehavior = new KanbanColumnBehavior({
  blockType: KANBAN_COLUMN_BLOCK_TYPE,
  parentType: KANBAN_BLOCK_TYPE,
});
