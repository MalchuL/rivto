/**
 * Bridges core selection state to browser DOM selection.
 *
 * Core owns block selection with per-block offsets. React reads native
 * endpoints and restores them after rendering. Scheduled callbacks observe
 * effective core selection changes so newer selection changes always win,
 * including transitions from an empty selection back to an empty selection.
 */
import type { SelectionManagerApi, Selection } from "@chulane/rivto";
import type { EventsCapability, RestoreDOMSelectionOptions, SelectionCapability } from "../../capabilities";
import type { ReactEditor } from "../../types";
import { readEditorDOMSelection, restoreEditorDOMSelection } from "./editor-dom-selection";

export { createCaretSelection, createTextSelection } from "@chulane/rivto";

/**
 * State owned by one deferred selection request. Cancellation handles retain
 * this record so a stale handle cannot cancel a newer request on the manager.
 * Frame and subscription are assigned during scheduling before caller cleanup runs.
 */
interface PendingSelectionCallback {
  readonly root: HTMLElement;
  readonly events: EventsCapability;
  readonly view: Window;
  readonly callback: () => void;
  readonly onCancel?: () => void;
  active: boolean;
  frame?: number;
  unsubscribe?: () => void;
}

/** DOM adapter over the core selection manager. */
export class ReactSelectionManager implements SelectionCapability {

  /** One pending frame per DOM root, cancelled by any effective core selection change. */
  private readonly pendingSelectionCallbacks = new Map<HTMLElement, PendingSelectionCallback>();
  /**
   * Creates a bridge scoped to one React runtime.
   * Every view delegates to this one manager and shares the core selection.
   * DOM requests capture the receiving view's event scope and remain separate
   * by root. Removing a surface cancels its own pending work; runtime teardown
   * cancels all remaining requests before shared extensions are destroyed.
   * @param reactEditor - Owning React runtime providing the active DOM root.
   * @param coreSelection - Core manager providing the document's local selection state.
   */
  constructor(
    private readonly reactEditor: ReactEditor,
    private readonly coreSelection: Omit<SelectionManagerApi, "resolveBlockSelection">,
  ) {}

  /**
   * Identifies a pending callback in the current view whose scheduled model selection remains current.
   * @returns False after any effective core selection change, including explicit clearing.
   */
  get hasPendingSelectionCallback(): boolean {
    const root = this.reactEditor.events.getRoot();
    return root !== null && this.pendingSelectionCallbacks.has(root);
  }

  /** @returns Detached current selection. */
  get(): Selection | undefined {
    return this.coreSelection.get();
  }

  /**
   * Publishes block selection through core.
   * @param selection - Local selection values.
   * @returns No value.
   */
  set(selection: Selection): void {
    this.reactEditor.events.runInView(() => this.coreSelection.set(selection));
  }

  /** Clears local selection. */
  clear(): void {
    this.coreSelection.clear();
  }

  /**
   * Subscribes to local selection changes.
   * @param listener - Callback invoked after an effective change.
   * @returns Function that removes the listener.
   */
  subscribe(listener: () => void): () => void {
    return this.coreSelection.subscribe(listener);
  }

  /** Deletes the current selection through core. */
  delete(): void {
    this.coreSelection.delete();
  }

  /** @returns Stable core selection snapshot. */
  snapshot(): Selection | undefined { return this.coreSelection.snapshot(); }

  /** @returns Whether a block has structural selection coverage. */
  isBlockSelected(id: string): boolean { return this.coreSelection.isBlockSelected(id); }

  /** @returns Whether an element belongs to the current selection. */
  isElementSelected(id: string): boolean { return this.coreSelection.isElementSelected(id); }

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
   * New native input, pointer gestures, or keys cancel restoration immediately, before the browser's
   * deferred selectionchange can publish the newer caret to core. Moving focus
   * outside the surface also cancels restoration; a temporary blur without a
   * new focus target during DOM reconciliation keeps the request alive.
   * The subscription ends before invocation so the callback may publish its
   * result. A transient empty browser range is handled by the native selection
   * bridge while pending and does not invalidate the preserved model selection.
   *
   * Use this slot only for caret, DOM selection, and their associated editing focus.
   * Keep document mutations and independent UI work outside the callback: a new
   * scheduled callback replaces the previous one for that DOM root even if
   * selection is unchanged. Requests in other views remain independently cancellable.
   * Endpoint mounting and viewport preservation may support selection restoration,
   * but must not turn this into a scheduler for unrelated operations.
   *
   * @param callback - Work to run next frame if selection has not changed since scheduling.
   * @param onCancel - Cleanup for caller-owned resources when the callback cannot run.
   * @returns An idempotent cancellation function, also invoked during runtime teardown.
   */
  scheduleIfSelectionUnchanged(callback: () => void, onCancel?: () => void): () => void {
    const root = this.reactEditor.events.getRoot();
    const previous = root ? this.pendingSelectionCallbacks.get(root) : undefined;
    // Schedule and cancel through the root's own window, including editors in an iframe.
    // Without a mounted root/window there is no valid frame to run the caller's work in.
    const view = root?.ownerDocument.defaultView;
    if (!root || !view) {
      this.cancelSelectionCallback(previous);
      onCancel?.();
      return () => {};
    }
    // Capture the mounted occurrence, not whichever view is active next frame.
    const events = this.reactEditor.events.getDocumentView()?.events ?? this.reactEditor.events;
    const pending: PendingSelectionCallback = { root, events, view, callback, onCancel, active: true };
    /**
     * Cancels only this request, even after newer work replaces it.
     * @returns No value.
     */
    const cancel = (): void => this.cancelSelectionCallback(pending);
    this.pendingSelectionCallbacks.set(root, pending);
    // Observe changes as they happen rather than compare final snapshots: selection
    // may change and return to its original value before the frame, even to undefined.
    // Core ignores equivalent updates, so publishing the same selection keeps this valid.
    // subscribe does not invoke its listener immediately, and RAF is asynchronous;
    // the record's subscription and frame are initialized before either callback runs.
    const unsubscribe = this.subscribe(cancel);
    // An undo in one editor must not steal focus back after another is focused.
    const leaveRoot = (event: FocusEvent) => {
      if (event.relatedTarget && !root.contains(event.relatedTarget as Node)) cancel();
    };
    root.addEventListener("beforeinput", cancel);
    root.addEventListener("pointerdown", cancel);
    root.addEventListener("keydown", cancel);
    root.addEventListener("focusout", leaveRoot);
    pending.unsubscribe = () => {
      unsubscribe();
      root.removeEventListener("beforeinput", cancel);
      root.removeEventListener("pointerdown", cancel);
      root.removeEventListener("keydown", cancel);
      root.removeEventListener("focusout", leaveRoot);
    };
    pending.frame = view.requestAnimationFrame(() => this.runSelectionCallback(pending));
    // One callback owns this root's deferred selection work. Release the predecessor's
    // subscription and caller-owned resources after publishing the initialized request:
    // onCancel may schedule newer work, which must replace this request rather than leak.
    this.cancelSelectionCallback(previous);
    return cancel;
  }

  /**
   * Cancels DOM restoration belonging to a surface that is being removed or replaced.
   * EventManager calls this before releasing the root; requests in other views
   * are retained. Cleanup that schedules more work for this same root is also cancelled.
   * @param root - Exact surface root whose pending frame and resources must be released.
   * @returns No value; roots without pending work are harmless.
   */
  cancelPendingSelectionCallback(root: HTMLElement): void {
    while (this.pendingSelectionCallbacks.has(root)) {
      this.cancelSelectionCallback(this.pendingSelectionCallbacks.get(root));
    }
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
    if (this.pendingSelectionCallbacks.get(pending.root) === pending) this.pendingSelectionCallbacks.delete(pending.root);
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
    if (pending.events.getRoot() !== pending.root) {
      this.cancelSelectionCallback(pending);
    } else {
      // Unregister before invoking: the callback may publish selection or
      // schedule further work, which must not cancel the completed operation.
      pending.active = false;
      pending.unsubscribe?.();
      this.pendingSelectionCallbacks.delete(pending.root);
      // The caller performs any selection restoration or focus work. This scheduler
      // only guards invocation; it does not restore anything after the callback runs.
      pending.events.runInView(pending.callback);
    }
  }

  /**
   * Releases the pending callback before the owning runtime tears down extensions.
   * Cancelling removes the frame and core subscription and releases caller-owned
   * resources exactly once, including when destruction is repeated.
   * Requests for every mounted view are cancelled here, including shared work
   * scheduled by their cancellation callbacks while cleanup is running.
   * No view owns a separate selection manager or independent core selection.
   * @returns No value.
   */
  destroy(): void {
    for (const pending of this.pendingSelectionCallbacks.values()) this.cancelSelectionCallback(pending);
  }
}
