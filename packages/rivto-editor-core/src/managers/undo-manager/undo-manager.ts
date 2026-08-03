import type { CRDTUndoManager } from "../../store/crdt-doc";
import type { DocumentModel } from "../../store/document-model";

/**
 * Owns local undo and redo history for one document model.
 *
 * The manager is intentionally a small adapter wrapper. DocumentModelImpl
 * already knows which collaborative roots make up the editor document and
 * which transaction origin belongs to local editor mutations. UndoManager only
 * asks the CRDT adapter to track those scopes for that origin, then exposes the
 * editor-level history verbs without leaking Yjs or another provider type.
 */
export class UndoManager {
  private readonly manager: CRDTUndoManager;

  /**
   * Creates an undo stack for local mutations in the supplied document.
   *
   * @param document - Document whose block, link, and plugin-data scopes should be undoable.
   */
  constructor(document: DocumentModel) {
    this.manager = document.crdt.createUndoManager(document.undoScopes, [document.origin]);
  }

  /**
   * Reverts the latest captured local document operation.
   *
   * Remote changes and transactions created with a different origin are not
   * tracked by this manager, so undo remains scoped to this editor runtime.
   */
  undo(): void {
    this.manager.undo();
  }

  /**
   * Reapplies the latest operation reverted by undo().
   *
   * Calling redo when there is no redo item is delegated to the CRDT adapter and
   * is expected to be a harmless no-op.
   */
  redo(): void {
    this.manager.redo();
  }

  /**
   * Drops all undo and redo items without changing document content.
   *
   * Runtime load operations use this so persisted state becomes the new
   * baseline instead of an undoable user edit.
   */
  clear(): void {
    this.manager.clear();
  }

  /**
   * Ends the adapter's current capture group.
   *
   * Yjs can merge nearby transactions into one undo item. The runtime calls
   * this around built-in document commands so each command becomes its own
   * editor history step.
   */
  stopCapturing(): void {
    this.manager.stopCapturing();
  }

  /**
   * Releases adapter-owned subscriptions and history resources.
   *
   * The document remains alive; only this manager's history observer is torn
   * down.
   */
  destroy(): void {
    this.manager.destroy();
  }
}
