import type { CRDTUndoManager } from "../../store/crdt-doc";
import type { DocumentModelImpl } from "../../store/document-model";

/** Wraps adapter-neutral undo history scoped to local document operations. */
export class UndoManager {
  private readonly manager: CRDTUndoManager;

  /**
   * Creates history over the document's collaborative scopes and local origin.
   *
   * @param document - Document whose local mutations should be undoable.
   */
  constructor(document: DocumentModelImpl) {
    this.manager = document.crdt.createUndoManager(document.undoScopes, [document.origin]);
  }

  /** Reverts the latest captured local operation. */
  undo(): void { this.manager.undo(); }

  /** Reapplies the latest locally undone operation. */
  redo(): void { this.manager.redo(); }

  /** Discards undo and redo history without changing document content. */
  clear(): void { this.manager.clear(); }

  /** Ends the adapter's current operation-capture group. */
  stopCapturing(): void { this.manager.stopCapturing(); }

  /** Releases adapter subscriptions owned by this history manager. */
  destroy(): void { this.manager.destroy(); }
}
