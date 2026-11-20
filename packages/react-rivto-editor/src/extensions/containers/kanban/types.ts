import type { ReactPanelApi } from "../../../panels/types";

/** Occurrence operations used to defer focus after a Kanban insertion. */
export interface KanbanFocusPanel extends Pick<ReactPanelApi, "batchUpdates" | "inputRoot"> {
  /** Schedules and performs caret focus without owning selection lifecycle. */
  readonly selection: Pick<
    ReactPanelApi["selection"],
    "scheduleIfSelectionUnchanged" | "focusBlock"
  >;
}

/** Operations used to append and focus a Kanban column. */
export interface KanbanColumnPanel extends KanbanFocusPanel {
  /** Expands the board and inserts its new column. */
  readonly blocks: Pick<ReactPanelApi["blocks"], "updateBlock" | "insertBlock">;
}

/** Shared writing-block factory borrowed when creating a Kanban card. */
export interface KanbanCardEditor {
  /** Creates the host's configured empty writing block. */
  readonly defaultWritingBlockFactory: Pick<
    ReactPanelApi["editor"]["defaultWritingBlockFactory"],
    "createEmptyBlock"
  >;
}

/** Operations used to append a writing block and select it as a Kanban card. */
export interface KanbanCardPanel extends KanbanFocusPanel {
  /** Inserts the new card in this occurrence. */
  readonly blocks: Pick<ReactPanelApi["blocks"], "insertBlock">;
  /** Publishes the card caret and schedules its focus. */
  readonly selection: Pick<ReactPanelApi["selection"], keyof KanbanFocusPanel["selection"] | "set">;
  /** Shared writing-block policy. */
  readonly editor: KanbanCardEditor;
}
