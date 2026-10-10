/**
 * Exposes history and transaction capture while keeping the document-owned
 * implementation behind a core capability boundary.
 */
import type { DocumentHistoryManagerApi } from "@chulane/document-model";
import type { HistoryManagerApi } from "../types";

/** Core-facing proxy for one document's history and batching operations. */
export class HistoryManager implements HistoryManagerApi {
  /** @param documents - The fixed document’s history and transaction batching implementation. */
  constructor(private readonly manager: DocumentHistoryManagerApi) {}

  /**
   * Groups synchronous mutations into one transaction and undo item.
   * It also creates capture breakpoints before and after the operation so
   * adjacent editor actions do not merge into the same undo step.
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

}
