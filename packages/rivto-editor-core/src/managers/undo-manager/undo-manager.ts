/**
 * Exposes undo and redo history while keeping the document-owned implementation
 * behind a core capability boundary. Transaction batching belongs to the editor.
 */
import type { DocumentUndoManager } from "@chulane/document-model";

/** Core-facing proxy for one document's undo and redo history. */
export class UndoManager {
  /**
   * Creates a core history proxy.
   * @param manager - Document-owned history implementation to delegate to.
   */
  constructor(private readonly manager: DocumentUndoManager) {}

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
