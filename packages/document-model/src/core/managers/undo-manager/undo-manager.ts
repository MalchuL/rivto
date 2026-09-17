/**
 * Owns local undo/redo history for one document. Storage managers define the
 * tracked roots; the document model owns transaction batching and passes their
 * private scope accumulator here once during construction.
 */
import type { CRDTDoc, CRDTUndoManager, CRDTUndoScope } from "@chulane/crdt-doc";

/** Focused history manager shared by document and editor operations. */
export class DocumentUndoManager {
  private readonly manager: CRDTUndoManager;

  /**
   * Creates local history for the document's accumulated collaborative roots.
   *
   * @param crdt - Collaborative document that owns transaction identity.
   * @param scopes - Private roots declared by the document storage managers.
   */
  constructor(crdt: CRDTDoc, scopes: CRDTUndoScope[]) {
    this.manager = crdt.createUndoManager(scopes);
  }

  /** @returns No value after reverting the latest local document operation. */
  undo(): void {
    this.manager.undo();
  }

  /** @returns No value after reapplying the latest reverted operation. */
  redo(): void {
    this.manager.redo();
  }

  /** @returns No value after dropping all undo and redo entries. */
  clear(): void {
    this.manager.clear();
  }

  /** @returns No value after ending the adapter's current capture group. */
  stopCapturing(): void {
    this.manager.stopCapturing();
  }

  /** @returns No value after releasing adapter-owned history resources. */
  destroy(): void {
    this.manager.destroy();
  }
}
