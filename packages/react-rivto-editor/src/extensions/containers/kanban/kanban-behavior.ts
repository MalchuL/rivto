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
import type { DropAxis } from "../../../block-behaviors/types";

export const KANBAN_BLOCK_TYPE = "kanban";
export const KANBAN_COLUMN_BLOCK_TYPE = "kanban-column";

/**
 * Behavior registered for the `kanban` board type.
 */
export class KanbanBehavior extends ContainerBlockBehavior {
  override readonly dropChildTypes = [KANBAN_COLUMN_BLOCK_TYPE];
  override readonly dropAxis: DropAxis = "horizontal";
}

/**
 * Behavior registered for the `kanban-column` type.
 */
export class KanbanColumnBehavior extends ContainerBlockBehavior {
  override readonly dropParentTypes = [KANBAN_BLOCK_TYPE];
  override readonly dropAxis: DropAxis = "vertical";
}

/** Shared board instance registered by {@link kanbanExtension}. */
export const kanbanBehavior = new KanbanBehavior();

/** Shared column instance registered by {@link kanbanExtension}. */
export const kanbanColumnBehavior = new KanbanColumnBehavior();
