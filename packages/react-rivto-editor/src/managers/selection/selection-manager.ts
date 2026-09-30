/**
 * Bridges core selection state to browser DOM selection.
 *
 * Core owns block selection with per-block offsets. React reads native
 * endpoints and restores them after rendering. Scheduled callbacks observe
 * effective core selection changes so newer selection changes always win,
 * including transitions from an empty selection back to an empty selection.
 */
import type { RivtoEditorApi, Selection } from "@chulane/rivto";
import type { RestoreDOMSelectionOptions, SelectionCapability } from "../../capabilities";
import type { ReactEditorImpl } from "../../react-editor";
import { readEditorDOMSelection, restoreEditorDOMSelection } from "./editor-dom-selection";

export { createCaretSelection, createTextSelection } from "@chulane/rivto";

/**
 * State owned by one deferred selection request. Cancellation handles retain
 * this record so a stale handle cannot cancel a newer request on the manager.
 * Frame and subscription are assigned during scheduling before caller cleanup runs.
 */
interface PendingSelectionCallback {
  readonly root: HTMLElement;
  readonly view: Window;
  readonly callback: () => void;
  readonly onCancel?: () => void;
  active: boolean;
  frame?: number;
  unsubscribe?: () => void;
}

/** DOM adapter over the core selection manager. */
export class ReactSelectionManager implements SelectionCapability {

  /** One pending frame, cancelled by any effective model selection change. */
  private pendingSelectionCallback?: PendingSelectionCallback;
  /**
   * Creates a bridge scoped to one React runtime.
   * @param reactEditor - Owning React runtime providing the active DOM root.
   * @param editor - Core runtime providing selection state.
   */
  constructor(
    private readonly reactEditor: ReactEditorImpl,
    private readonly editor: RivtoEditorApi,
  ) {}

  /**
   * Identifies a pending callback whose scheduled model selection remains current.
   * @returns False after any effective core selection change, including explicit clearing.
   */
  get hasPendingSelectionCallback(): boolean {
    return Boolean(this.pendingSelectionCallback);
  }

  /** @returns Detached current selection. */
  get(): Selection | undefined {
    return this.editor.selection.get();
  }

  /**
   * Publishes block selection through core.
   * @param selection - Local selection values.
   * @returns No value.
   */
  set(selection: Selection): void {
    this.editor.selection.set(selection);
  }

  /** Clears local selection. */
  clear(): void {
    this.editor.selection.clear();
  }

  /**
   * Subscribes to local selection changes.
   * @param listener - Callback invoked after an effective change.
   * @returns Function that removes the listener.
   */
  subscribe(listener: () => void): () => void {
    return this.editor.selection.subscribe(listener);
  }

  /** Deletes the current selection through core. */
  delete(): void {
    this.editor.selection.delete();
  }

  /** @returns Stable core selection snapshot. */
  snapshot(): Selection | undefined { return this.editor.selection.snapshot(); }

  /** @returns Whether a block has structural selection coverage. */
  isBlockSelected(id: string): boolean { return this.editor.selection.isBlockSelected(id); }

  /** @returns Whether an element belongs to the current selection. */
  isElementSelected(id: string): boolean { return this.editor.selection.isElementSelected(id); }

  /**
   * Reads current native endpoints.
   * @returns Browser selection, or undefined outside this editor.
   */
  readDOM(): Selection | undefined {
    const root = this.reactEditor.events.getRoot();
    return root ? readEditorDOMSelection(root) : undefined;
  }

  /**
   * Restores a non-structural range after DOM reconciliation.
   * @param selection - Selection to restore, defaulting to current state.
   * @param options - Virtual endpoint mounting and navigation policy.
   * @returns Whether both text endpoints could be restored.
   */
  restoreDOM(
    selection: Selection | undefined = this.get(),
    options?: RestoreDOMSelectionOptions,
  ): boolean {
    const root = this.reactEditor.events.getRoot();
    return root && selection ? restoreEditorDOMSelection(root, selection, options) : false;
  }

  /**
   * Schedules a callback for the next animation frame while its selection remains current.
   * A scoped core subscription ignores equivalent publications and cancels on
   * effective updates, even when selection changes away and back to empty.
   * The subscription ends before invocation so the callback may publish its
   * result. A transient empty browser range is handled by the native selection
   * bridge while pending and does not invalidate the preserved model selection.
   *
   * Use this slot only for caret, DOM selection, and their associated editing focus.
   * Keep document mutations and independent UI work outside the callback: a new
   * scheduled callback replaces the previous one even if selection is unchanged.
   * Endpoint mounting and viewport preservation may support selection restoration,
   * but must not turn this into a scheduler for unrelated operations.
   *
   * @param callback - Work to run next frame if selection has not changed since scheduling.
   * @param onCancel - Cleanup for caller-owned resources when the callback cannot run.
   * @returns An idempotent cancellation function, also invoked during runtime teardown.
   */
  scheduleIfSelectionUnchanged(callback: () => void, onCancel?: () => void): () => void {
    const previous = this.pendingSelectionCallback;
    const root = this.reactEditor.events.getRoot();
    // Schedule and cancel through the root's own window, including editors in an iframe.
    // Without a mounted root/window there is no valid frame to run the caller's work in.
    const view = root?.ownerDocument.defaultView;
    if (!root || !view) {
      this.cancelSelectionCallback(previous);
      onCancel?.();
      return () => {};
    }
    const pending: PendingSelectionCallback = { root, view, callback, onCancel, active: true };
    /**
     * Cancels only this request, even after newer work replaces it.
     * @returns No value.
     */
    const cancel = (): void => this.cancelSelectionCallback(pending);
    this.pendingSelectionCallback = pending;
    // Observe changes as they happen rather than compare final snapshots: selection
    // may change and return to its original value before the frame, even to undefined.
    // Core ignores equivalent updates, so publishing the same selection keeps this valid.
    // subscribe does not invoke its listener immediately, and RAF is asynchronous;
    // the record's subscription and frame are initialized before either callback runs.
    pending.unsubscribe = this.subscribe(cancel);
    pending.frame = view.requestAnimationFrame(() => this.runSelectionCallback(pending));
    // One callback owns the current selection's deferred work. Release the predecessor's
    // subscription and caller-owned resources after publishing the initialized request:
    // onCancel may schedule newer work, which must replace this request rather than leak.
    this.cancelSelectionCallback(previous);
    return cancel;
  }

  /**
   * Cancels a request's frame and releases caller resources exactly once.
   * @param pending - Request to cancel; missing or inactive requests are harmless.
   * @returns No value.
   */
  private cancelSelectionCallback(pending: PendingSelectionCallback | undefined): void {
    if (!pending?.active) return;
    // Mark inactive before cleanup: onCancel may cancel again or schedule another
    // callback. Neither path may release this callback's resources a second time.
    pending.active = false;
    if (pending.frame !== undefined) pending.view.cancelAnimationFrame(pending.frame);
    pending.unsubscribe?.();
    // Clear only our own entry; an old cancellation must never erase newer work.
    if (this.pendingSelectionCallback === pending) this.pendingSelectionCallback = undefined;
    pending.onCancel?.();
  }

  /**
   * Runs a still-active request only on the DOM surface where it was scheduled.
   * @param pending - Request whose animation frame has arrived.
   * @returns No value.
   */
  private runSelectionCallback(pending: PendingSelectionCallback): void {
    if (!pending.active) return;
    // The same model selection can outlive its DOM surface. A replacement root
    // invalidates work prepared for the old surface even without a selection update.
    if (this.reactEditor.events.getRoot() !== pending.root) {
      this.cancelSelectionCallback(pending);
    } else {
      // Unregister before invoking: the callback may publish selection or
      // schedule further work, which must not cancel the completed operation.
      pending.active = false;
      pending.unsubscribe?.();
      this.pendingSelectionCallback = undefined;
      // The caller performs any selection restoration or focus work. This scheduler
      // only guards invocation; it does not restore anything after the callback runs.
      pending.callback();
    }
  }

  /**
   * Releases the pending callback before the owning runtime tears down extensions.
   * Cancelling removes the frame and core subscription and releases caller-owned
   * resources exactly once, including when destruction is repeated.
   * @returns No value.
   */
  destroy(): void {
    this.cancelSelectionCallback(this.pendingSelectionCallback);
  }
}
