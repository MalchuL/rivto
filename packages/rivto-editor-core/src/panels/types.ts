import type { BlockDestination } from "@chulane/document-model";
import type { HistoryTransactions } from "../managers/types";
import type { DocumentEditorAPI } from "../editor/types";
/** Fixed, independent block and element boundaries; omitted roots select the whole document. */
export interface PanelOptions {
  readonly rootBlockId?: string | null;
  readonly rootElementId?: string | null;
}

/** Framework-neutral editing operations bound permanently to one document and its selected subtrees. */
export interface PanelAPI extends DocumentEditorAPI, HistoryTransactions {
  /** Source editor or panel, borrowed without ownership; document snapshot operations remain document-wide. */
  readonly document: DocumentEditorAPI;
  /** Document identity exposed on a scoped panel; document.getDocument always returns this editor’s model. */
  readonly documentId: string;
  /**
   * Fixed block boundary for this subtree; an omitted root inherits the source panel’s scope
   * or exposes document roots when the source is a document.
   * An embedding displays the root and its descendants. A Panel displays only
   * its children, keeping the root available to the host as a title.
   */
  readonly rootBlockId?: string;
  /** Element container excluded from reads and mutations; null selects document roots. */
  readonly rootElementId: string | null;
}

/** Destination relative to the panel root. */
export type PanelDestination = BlockDestination;
