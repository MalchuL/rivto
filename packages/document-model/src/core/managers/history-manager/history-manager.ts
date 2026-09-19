/**
 * Owns local history and transaction capture boundaries for one document.
 * Storage managers define the tracked roots and the document model passes their
 * private scope accumulator here once during construction.
 */
import type { CRDTDoc, CRDTUndoManager, CRDTUndoScope } from "@chulane/crdt-doc";
import type { DocumentHistoryManagerApi } from "../../types";

/** Focused history manager shared by document and editor operations. */
export class DocumentHistoryManager implements DocumentHistoryManagerApi {
  private readonly manager: CRDTUndoManager;
  /** Collaborative document used to group writes into transaction boundaries. */
  private readonly crdt: CRDTDoc;
  /** Nesting depth for the active undoable batch. */
  private batchDepth = 0;
  /** Transaction origin excluded from user undo history. */
  private readonly withoutHistoryOrigin = Symbol("rivto-without-history");

  /**
   * Creates local history for the document's accumulated collaborative roots.
   *
   * @param crdt - Collaborative document that owns transaction identity.
   * @param scopes - Private roots declared by the document storage managers.
   */
  constructor(crdt: CRDTDoc, scopes: CRDTUndoScope[]) {
    this.crdt = crdt;
    this.manager = crdt.createUndoManager(scopes);
  }

  /**
   * Groups synchronous mutations into one transaction and undo item.
   *
   * Nested calls reuse the active transaction and capture boundary.
   *
   * @param operation - Synchronous document work to execute atomically.
   * @returns Value returned by the operation.
   */
  batchUpdates<Result>(operation: () => Result): Result {
    if (this.batchDepth > 0) return operation();
    this.manager.stopCapturing();
    this.batchDepth += 1;
    let result!: Result;
    try {
      this.crdt.transact(() => { result = operation(); });
      return result;
    } finally {
      this.batchDepth -= 1;
      this.manager.stopCapturing();
    }
  }

  /**
   * Groups synchronous mutations into one transaction excluded from undo history.
   *
   * @param operation - Synchronous document work to execute without an undo item.
   * @returns Value returned by the operation.
   */
  batchUpdatesWithoutHistory<Result>(operation: () => Result): Result {
    let result!: Result;
    this.crdt.transact(() => { result = operation(); }, this.withoutHistoryOrigin);
    return result;
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
