import { Panel } from "./panel";
import { PanelBlocks } from "./panel-blocks";
import type { DocumentEditorAPI } from "../editor/types";
import type { PanelAPI, PanelOptions } from "./types";

/** Displays one protected source block together with its descendants. */
export class EmbeddingPanel extends Panel {
  /**
   * Binds a protected subtree to the document or an existing panel's block view.
   *
   * @param editor - Borrowed document editor; this panel never acquires or destroys it.
   * @param options - Independent roots; the block root is required and protected.
   * @param source - Optional enclosing panel supplying block operations and transaction boundaries.
   */
  constructor(
    editor: DocumentEditorAPI,
    options: PanelOptions & { readonly rootBlockId: string },
    private readonly source?: Pick<
      PanelAPI,
      "blocks" | "batchUpdates" | "batchUpdatesWithoutHistory" | "subscribe"
    >,
  ) {
    super(editor, options, new PanelBlocks(editor, options.rootBlockId, true, source?.blocks));
  }

  /**
   * Observes changes through the enclosing panel when one supplies this subtree.
   *
   * @param listener - Callback notified when the enclosing panel changes.
   * @returns Disposer for the borrowed subscription.
   */
  override subscribe(listener: () => void): () => void {
    return this.source ? this.source.subscribe(listener) : super.subscribe(listener);
  }

  /**
   * Runs synchronous changes through the enclosing panel's transaction boundary.
   *
   * @param operation - Synchronous changes to apply as one history item.
   * @returns The operation's return value.
   * @throws If the operation or its enclosing transaction fails.
   */
  override batchUpdates<Result>(operation: () => Result): Result {
    return this.source ? this.source.batchUpdates(operation) : super.batchUpdates(operation);
  }

  /**
   * Runs synchronous maintenance changes through the enclosing panel without history.
   *
   * @param operation - Synchronous maintenance changes.
   * @returns The operation's return value.
   * @throws If the operation or its enclosing transaction fails.
   */
  override batchUpdatesWithoutHistory<Result>(operation: () => Result): Result {
    return this.source
      ? this.source.batchUpdatesWithoutHistory(operation)
      : super.batchUpdatesWithoutHistory(operation);
  }
}
