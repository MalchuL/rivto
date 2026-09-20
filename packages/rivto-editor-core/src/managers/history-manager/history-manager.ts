/**
 * Exposes history and transaction capture while keeping the document-owned
 * implementation behind a core capability boundary.
 */
import type { DocumentHistoryManagerApi } from "@chulane/document-model";
import type { HistoryManagerApi } from "../types";

/** Core-facing proxy for one document's history and batching operations. */
export class HistoryManager implements HistoryManagerApi {
  /** Document history currently attached to the editor. */
  private manager?: DocumentHistoryManagerApi;

  /**
   * Switches every history operation to the active document's history.
   * @param manager - History manager owned by the new active document.
   * @returns No value.
   */
  setDocument(manager: DocumentHistoryManagerApi): void {
    this.manager = manager;
  }

  /**
   * Groups synchronous mutations into one transaction and undo item.
   * It also creates capture breakpoints before and after the operation so
   * adjacent editor actions do not merge into the same undo step.
   *
   * @param operation - Synchronous editor work to execute.
   * @returns Value returned by the operation.
   */
  batchUpdates<Result>(operation: () => Result): Result {
    return this.getManager().batchUpdates(operation);
  }

  /**
   * Groups synchronous mutations into one transaction excluded from undo history.
   *
   * @param operation - Synchronous editor work to execute without an undo item.
   * @returns Value returned by the operation.
   */
  batchUpdatesWithoutHistory<Result>(operation: () => Result): Result {
    return this.getManager().batchUpdatesWithoutHistory(operation);
  }

  /** @returns No value after reverting the latest local document operation. */
  undo(): void {
    this.getManager().undo();
  }

  /** @returns No value after reapplying the latest reverted operation. */
  redo(): void {
    this.getManager().redo();
  }

  /** @returns No value after dropping all undo and redo entries. */
  clear(): void {
    this.getManager().clear();
  }

  /** @returns No value after ending the current capture group. */
  stopCapturing(): void {
    this.getManager().stopCapturing();
  }

  /** @returns The attached document history manager. */
  private getManager(): DocumentHistoryManagerApi {
    if (!this.manager) throw new Error("Document is not set");
    return this.manager;
  }
}
