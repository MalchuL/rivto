import type { DocumentEditorAPI } from "../editor/types";
/** Fixed, independent block and element boundaries; omitted roots select the whole document. */
export interface PanelOptions {
  readonly rootBlockId?: string | null;
  readonly rootElementId?: string | null;
}

/** Framework-neutral editing operations bound permanently to one document and its selected subtrees. */
export interface PanelAPI extends DocumentEditorAPI {
  /** Source editor or panel, borrowed without ownership; document snapshot operations remain document-wide. */
  readonly document: DocumentEditorAPI;
  /**
   * Observes the shared document editor's change stream without filtering by panel boundaries.
   * Changes outside this panel and block-definition changes can also notify the listener.
   * Selection changes use their own subscription and do not notify this stream.
   * Registration does not invoke the listener; read the initial state separately.
   * @param listener - Callback invoked with no arguments after an observable document-editor change.
   * @returns Function that removes this listener from the shared document editor.
   */
  subscribe(listener: () => void): () => void;
  /**
   * Groups synchronous edits into one document transaction and undo step.
   * Nested batches share the outer transaction; history remains shared by every
   * panel of this document. Use blocks/elements for boundary-checked mutations.
   * This is not a rollback boundary: writes made before an error remain applied.
   * @param operation - Synchronous work; edits after an await are outside this batch.
   * @returns The callback's result.
   * @throws Propagates errors from the callback.
   */
  batchUpdates<Result>(operation: () => Result): Result;
  /**
   * Groups synchronous edits into a document transaction excluded from undo history.
   * When nested in an existing transaction, its outer origin determines history
   * capture. Panel boundaries still come from blocks/elements, not this callback.
   * Writes made before an error remain applied; no separate panel history is created.
   * @param operation - Synchronous work; edits after an await are outside this batch.
   * @returns The callback's result.
   * @throws Propagates errors from the callback.
   */
  batchUpdatesWithoutHistory<Result>(operation: () => Result): Result;
  /** Document identity exposed on a scoped panel; document.getDocument always returns this editor’s model. */
  readonly documentId: string;
  /**
   * Root block that bounds this subtree; undefined shows the full document.
   * An embedding displays the root and its descendants. A Panel displays only
   * its children, keeping the root available to the host as a title.
   */
  readonly rootBlockId?: string;
  /** Element container excluded from reads and mutations; null selects document roots. */
  readonly rootElementId: string | null;
  /**
   * Reads and mutations constrained to the panel block tree.
   *
   * The selected root may be hidden or included and protected. Reads of an
   * absent or outside block return the manager's missing value, while mutations
   * reject outside targets before writing. `parentId: null` selects this panel's
   * root list. Existing document caches and processor registrations remain shared;
   * subscriptions created through this manager are released with the panel.
   */
  readonly blocks: DocumentEditorAPI["blocks"];
  /**
   * Reads and mutations constrained to the independent element tree.
   *
   * The selected element container is excluded from the tree. A missing container
   * reads as empty and rejects writes. `parentId: null` selects its child list;
   * a null container selects document roots. Reads use the document's caches and
   * mutations use its processors and history. Subscriptions created through this
   * manager are released with the panel.
   */
  readonly elements: DocumentEditorAPI["elements"];
}

/** Destination relative to the panel root. */
export type PanelDestination = { readonly parentId: string | null; readonly beforeId?: string };
