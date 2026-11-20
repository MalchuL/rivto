import type { ReactPanelApi } from "../../../../../panels/types";

/** Panel operations needed to convert a typed list shortcut. */
export interface ListShortcutPanel {
  /** Updates the converted block. */
  readonly blocks: Pick<ReactPanelApi["blocks"], "updateBlock">;
  /** Updates and restores the caret after conversion. */
  readonly selection: Pick<
    ReactPanelApi["selection"],
    "set" | "scheduleIfSelectionUnchanged" | "focusBlock"
  >;
  /** Batches the block and selection updates. */
  readonly batchUpdates: ReactPanelApi["batchUpdates"];
}
