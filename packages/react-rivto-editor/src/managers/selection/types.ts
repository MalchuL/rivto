import type { ReactPanelApi } from "../../panels/types";

/**
 * State owned by one deferred selection request. Cancellation handles retain
 * this record so a stale handle cannot cancel a newer request on the manager.
 * Frame and subscription are assigned during scheduling before caller cleanup runs.
 */
export interface PendingSelectionCallback {
  readonly root: HTMLElement;
  readonly panel: Pick<ReactPanelApi, "getRoot">;
  readonly view: Window;
  readonly callback: () => void;
  readonly onCancel?: () => void;
  active: boolean;
  frame?: number;
  unsubscribe?: () => void;
}
