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
import { ContainerBlockView } from "../../views/container-view";
import type { DropAxis } from "../../views/types";

/**
 * Behavior registered for the `kanban` board type.
 */
export class KanbanView extends ContainerBlockView {
  override readonly dropAxis: DropAxis = "horizontal";
}

/**
 * Behavior registered for the `kanban-column` type.
 */
export class KanbanColumnView extends ContainerBlockView {
  override readonly dropAxis: DropAxis = "vertical";
}

/** Shared board instance registered by {@link kanbanExtension}. */
export const kanbanView = new KanbanView();

/** Shared column instance registered by {@link kanbanExtension}. */
export const kanbanColumnView = new KanbanColumnView();
