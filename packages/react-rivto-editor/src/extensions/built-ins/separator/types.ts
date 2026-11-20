import type { ReactPanelApi } from "../../../panels/types";

/** Panel operations borrowed when inserting a separator and its writing block. */
export interface SeparatorInsertionPanel extends Pick<ReactPanelApi, "batchUpdates"> {
  /** Reads the active block and inserts or converts blocks. */
  readonly blocks: Pick<
    ReactPanelApi["blocks"],
    | "getBlockNode"
    | "hasChildren"
    | "setBlockType"
    | "updateBlock"
    | "insertBlock"
    | "canRemove"
    | "getInsertionDestinationAfter"
  >;
  /** Publishes the caret for the new writing block. */
  readonly selection: Pick<ReactPanelApi["selection"], "set">;
}
