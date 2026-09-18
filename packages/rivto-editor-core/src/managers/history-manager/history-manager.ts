/**
 * Exposes history and transaction capture while keeping the document-owned
 * implementation behind a core capability boundary.
 */
import type { DocumentHistoryManager } from "@chulane/document-model";

/** Core-facing proxy for one document's history and batching operations. */
export class HistoryManager {
  /**
   * Creates a core history proxy.
   * @param manager - Document-owned history implementation to delegate to.
   */
  constructor(private readonly manager: DocumentHistoryManager) {}

  /**
   * Groups synchronous mutations into one transaction and undo item.
   *
   * @param operation - Synchronous editor work to execute.
   * @returns Value returned by the operation.
   */
  batchUpdates<Result>(operation: () => Result): Result {
    return this.manager.batchUpdates(operation);
  }

  /**
   * Groups synchronous mutations into one transaction excluded from undo history.
   *
   * @param operation - Synchronous editor work to execute without an undo item.
   * @returns Value returned by the operation.
   */
  batchUpdatesWithoutHistory<Result>(operation: () => Result): Result {
    return this.manager.batchUpdatesWithoutHistory(operation);
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

  /** @returns No value after ending the current capture group. */
  stopCapturing(): void {
    this.manager.stopCapturing();
  }

  /** @returns No value after releasing document history resources. */
  destroy(): void {
    this.manager.destroy();
  }
}
