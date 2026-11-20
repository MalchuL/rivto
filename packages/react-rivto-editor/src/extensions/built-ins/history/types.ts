import type { ReactPanelApi } from "../../../panels/types";

/** One document-history action recognized from a browser editing event. */
export type HistoryAction = "undo" | "redo";

/** Document history borrowed by the history keyboard and input handlers. */
export interface HistoryDocument {
  /** Synchronous undo and redo operations. */
  readonly history: Pick<ReactPanelApi["document"]["history"], HistoryAction>;
}

/** Panel operations required to run history and restore its selection. */
export interface HistoryPanel {
  /** Document-wide history commands used by the receiving panel. */
  readonly document: HistoryDocument;
  /** Selection restoration after the history operation. */
  readonly selection: Pick<
    ReactPanelApi["selection"],
    "scheduleIfSelectionUnchanged" | "restoreDOM"
  >;
}
