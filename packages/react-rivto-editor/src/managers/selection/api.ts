import type { Selection } from "@chulane/rivto";

/** Selection commands and DOM synchronization for one EditorView.
 * The model selection is shared by the document. Reads expose it only in the active
 * view (or the default view before activation) and within that view's subtree. */
export interface ViewSelectionApi {
  /** @returns A detached selection, or undefined when empty or owned by another view. */
  get(): Selection | undefined;
  /**
   * Writes the document's shared selection without activating or focusing this view.
   * @param selection - Selection to publish. A block outside this view's subtree clears it instead.
   */
  set(selection: Selection): void;
  /** Clears the document's shared selection, including selection last set by another view. */
  clear(): void;
  /**
   * Subscribes to changes of the document's shared model selection.
   * @param listener - Called after effective selection changes, including changes in other views.
   * @returns Function that removes the subscription.
   */
  subscribe(listener: () => void): () => void;
  /** Deletes the selected content through core when this view owns the selection; otherwise does nothing. */
  delete(): void;
  /** Returns the shared immutable selection snapshot, retaining identity until selection changes.
   * Returns undefined when empty, outside this subtree, or owned by another view.
   * Use get() when a detached copy is needed; do not mutate this snapshot. */
  snapshot(): Selection | undefined;
  /** @param id - Block identifier. @returns Whether the block has structural coverage. */
  isBlockSelected(id: string): boolean;
  /** @param id - Element identifier. @returns Whether the element is selected. */
  isElementSelected(id: string): boolean;
  /** Reads text endpoints inside this view's root; returns undefined without a root or valid DOM selection. */
  readDOM(): Selection | undefined;
  /**
   * Restores browser text selection inside this view after rendering.
   * @param selection - Selection to restore; omitted to read this view's current model selection.
   * @param options - Controls scrolling when mounting virtualized text endpoints.
   * @returns Whether the text endpoints were restored; false without a root or usable selection.
   */
  restoreDOM(selection?: Selection, options?: RestoreDOMSelectionOptions): boolean;
  /**
   * Runs the callback next frame only if the model selection has not changed since scheduling.
   * Reserve callbacks for caret, DOM selection, and associated editing focus;
   * each call replaces previous pending work for the same DOM root even if
   * selection is unchanged. Other views keep their own pending DOM requests.
   * Keep document mutations and independent UI operations outside this scheduler.
   * @param callback - Work to perform next frame while the scheduled selection remains current.
   * @param onCancel - Optional cleanup when newer state or teardown supersedes the work.
   * @returns Idempotent cancellation for the pending callback.
   */
  scheduleIfSelectionUnchanged(callback: () => void, onCancel?: () => void): () => void;
  /** Whether the current selection has a pending, still-valid callback in the next frame. */
  readonly hasPendingSelectionCallback: boolean;
}

/** Options for rebuilding a portable selection in the live browser DOM. */
export interface RestoreDOMSelectionOptions {
  /** False mounts virtual endpoints without navigating the viewport to them. */
  readonly scroll?: boolean;
}
