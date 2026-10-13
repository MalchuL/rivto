import type { DocumentEditorAPI } from '../editor/types';
import { PanelElements } from './panel-elements';
import type { PanelAPI, PanelBlocksAPI, PanelElementsAPI, PanelOptions } from './types';

/**
 * Borrows one document editor and exposes bounded operations without subscriptions
 * or document mutations during construction.
 *
 * Block and element boundaries are independent and fixed for this panel's lifetime.
 * Subclasses supply the block visibility and root-protection policy. The caller
 * retains ownership of the document editor; this panel never destroys it.
 */
export abstract class Panel implements PanelAPI {
  /** Fixed block boundary, or undefined to expose the document's block roots. */
  readonly rootBlockId: string | undefined;
  /** Fixed element container, excluded from element operations; null selects document roots. */
  readonly rootElementId: string | null;
  /** Reads and mutations limited to descendants of the fixed element container. */
  readonly elements: PanelElementsAPI;
  /**
   * Creates element operations and records the selected subtree boundaries.
   *
   * @param document - Permanently bound editor, owned by the caller.
   * @param options - Independent subtree boundaries; omitted or null roots select document roots.
   * @param blocks - Concrete panel's boundary and root-protection policy.
   */
  protected constructor(readonly document: DocumentEditorAPI, options: PanelOptions, readonly blocks: PanelBlocksAPI) {
    this.rootBlockId = options.rootBlockId ?? undefined;
    this.rootElementId = options.rootElementId ?? null;
    this.elements = new PanelElements(document.elements, document.getDocument(), this.rootElementId);
  }
  /** @inheritdoc PanelAPI.subscribe */
  subscribe(listener: () => void): () => void {
    return this.document.subscribe(listener);
  }
  /** @inheritdoc PanelAPI.batchUpdates */
  batchUpdates<Result>(operation: () => Result): Result {
    return this.document.history.batchUpdates(operation);
  }
  /** @inheritdoc PanelAPI.batchUpdatesWithoutHistory */
  batchUpdatesWithoutHistory<Result>(operation: () => Result): Result {
    return this.document.history.batchUpdatesWithoutHistory(operation);
  }
  /**
   * Reads the identity of the model exposed by the borrowed editor.
   *
   * @returns Persisted identity of the borrowed document.
   */
  get documentId(): string { return this.document.getDocument().id; }
}
