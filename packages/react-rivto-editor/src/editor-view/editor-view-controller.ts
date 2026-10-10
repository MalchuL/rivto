import type { DocumentModel } from "@chulane/document-model";
import type { EditorRuntime } from "../editor/editor-runtime";
import type { EditorStorage, RuntimeAcquisition } from "../editor/editor-storage";
import { ViewClipboardManager } from "../managers/clipboard/view-clipboard-manager";
import { DOCUMENT_VIEW_ATTRIBUTE, type DocumentViewScope } from "../managers/events/document-view";
import { ViewEventManager } from "../managers/events/view-event-manager";
import { ViewKeyboardManager } from "../managers/keyboard/view-keyboard-manager";
import type { ViewSelectionApi } from "../managers/selection/api";
import { ViewSelectionManager } from "../managers/selection/view-selection-manager";
import { ViewSlashCommandManager } from "../managers/slash/view-slash-command-manager";
import type { EditorViewApi } from "./types";

/**
 * Loading and availability state returned to React through useSyncExternalStore.
 *
 * Loading may include an already readable document before retention finishes, or
 * while an embedded root has not arrived. Available and missing states both keep
 * the document and view API; missing means a previously observed root was removed.
 * Error contains the acquisition failure and exposes neither document nor API.
 * The snapshot is replaced on change; its model and API are live references.
 */
export type EditorViewSnapshot =
  | { readonly status: "loading"; readonly document?: DocumentModel; readonly api?: EditorViewApi; readonly retained?: boolean; readonly error?: never }
  | { readonly status: "available" | "missing"; readonly document: DocumentModel; readonly api: EditorViewApi; readonly retained: boolean; readonly error?: never }
  | { readonly status: "error"; readonly error: unknown; readonly document?: never; readonly api?: never; readonly retained?: never };

/**
 * Connects one EditorView component to its document, DOM root, and local managers.
 *
 * Each mounted component has its own controller, including repeated views of the
 * same document and embedded subtrees. Blocks, history, extension registrations,
 * and document lifetime belong to the supplied EditorRuntime and its owner.
 * The controller exposes EditorViewApi to components and event handlers while
 * keeping mount, storage acquisition, and cleanup inside the React view lifecycle.
 *
 * Creating the controller does not acquire a document. With EditorStorage, mount()
 * retains a separate consumer; without storage the caller keeps owning the runtime.
 * The controller's rootBlockId limits selection and navigation to one subtree.
 * Its registered DOM root determines which view receives local events and shortcuts.
 * Selection reads are empty when another registered view owns the current selection.
 *
 * Manager methods and subscriptions keep using their original document after a
 * focus change. Transaction callbacks are synchronous: after awaiting external work,
 * call the same view's managers again rather than expecting a global editing context.
 * Closing this view cancels pending DOM work and local registrations, then releases
 * its storage consumer. Other views keep their consumers and shared runtime.
 *
 * React StrictMode may mount the same controller again after cleanup. Its identity
 * stays stable, but the next mount creates a fresh selection manager and obtains a
 * new consumer. A late acquisition from an earlier mount is immediately released.
 */
export class EditorViewController implements DocumentViewScope, EditorViewApi {
  readonly events: ViewEventManager;
  readonly keyboard: ViewKeyboardManager;
  readonly clipboard: ViewClipboardManager;
  readonly slashCommands: ViewSlashCommandManager;
  private selectionManager: ViewSelectionManager;
  /** Selection operations for this occurrence; lifecycle remains private to the controller. */
  get selection(): ViewSelectionApi { return this.selectionManager; }
  /** Persisted identity of the document displayed by this occurrence. */
  get documentId(): string { return this.runtime.getDocument().id; }
  readonly id = crypto.randomUUID();
  private root: HTMLElement | null = null;
  private enabled = true;
  private snapshot: EditorViewSnapshot = { status: "loading" };
  private readonly listeners = new Set<() => void>();
  private readonly deactivationListeners = new Set<() => void>();
  private readonly registrations = new Set<() => void>();
  private acquisition?: RuntimeAcquisition;
  private request?: AbortController;
  private unregisterRoot?: () => void;
  private unsubscribeBlock?: () => void;
  private hasSeenRootBlock = false;

  /**
   * Prepares a view without acquiring or changing document state during render.
   * Loaded models can be read immediately, including server-side rendering.
   * @param runtime - Shared runtime permanently bound to this view's document.
   * @param rootBlockId - Optional subtree; omitted to display the full document.
   * @param storage - Optional host cache from EditorStorageContext; omitted for a caller-owned standalone editor.
   */
  constructor(readonly runtime: EditorRuntime, readonly rootBlockId?: string, private readonly storage?: EditorStorage) {
    this.events = new ViewEventManager(runtime.events, this, runtime.editorViews);
    this.keyboard = new ViewKeyboardManager(runtime.keyboard, this);
    this.selectionManager = new ViewSelectionManager(this, runtime.selection);
    this.clipboard = new ViewClipboardManager(runtime.clipboard, this);
    this.slashCommands = new ViewSlashCommandManager(runtime.slashCommands, this);
    this.updateSnapshot(runtime.getDocument());
  }

  /**
   * Returns the current snapshot without allocating a new object on each read.
   * @returns The same snapshot object until document, availability, or retention changes.
   */
  getSnapshot = (): EditorViewSnapshot => this.snapshot;
  /**
   * Returns the DOM root currently available to this view's interaction handlers.
   * @returns The assigned root, or null when no root is assigned or the view is disabled.
   */
  getRoot = (): HTMLElement | null => this.enabled ? this.root : null;
  /** @param listener - Loading-state observer. @returns Unsubscribe callback. */
  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => { this.listeners.delete(listener); };
  };
  /** @param listener - Closes transient UI when another view becomes active. @returns Unsubscribe callback. */
  subscribeDeactivation(listener: () => void): () => void {
    this.deactivationListeners.add(listener);
    return () => { this.deactivationListeners.delete(listener); };
  }
  /** @returns Nothing after notifying local transient UI that this view lost focus. */
  deactivate = (): void => { this.deactivationListeners.forEach((listener) => listener()); };

  /**
   * Retains cleanup for an event or keyboard registration made by this view.
   * @param dispose - Removes one local registration without destroying the shared manager.
   * @returns An idempotent disposer; mount cleanup also calls it if it is still retained.
   */
  own(dispose: () => void): () => void {
    let active = true;
    const release = () => {
      if (!active) return;
      active = false;
      this.registrations.delete(release);
      dispose();
    };
    this.registrations.add(release);
    return release;
  }

  /**
   * Retains the document for this mounted view and observes its embedded root, if any.
   *
   * With storage, each mount owns a separate acquisition. Cancellation releases only
   * that consumer and does not cancel another view's load. Without storage, the caller
   * continues to own the runtime. Acquisition failures are published in the snapshot.
   * A completion received after cleanup is released without attaching it to this view.
   *
   * The returned cleanup cancels loading, root subscriptions, pending DOM selection,
   * and local registrations, then starts asynchronous release of the acquired consumer.
   * Release failures are reported to console.error because React cannot await cleanup.
   * StrictMode can reuse this controller: the next mount creates a fresh selection
   * manager and obtains its own acquisition without reviving the previous DOM work.
   * @returns Cleanup for this mount; an older mount cannot release a newer acquisition.
   */
  mount(): () => void {
    // StrictMode remounts the same controller; pending DOM work belongs to a fresh selection manager.
    if (!this.snapshot.api) this.selectionManager = new ViewSelectionManager(this, this.runtime.selection);
    const request = new AbortController();
    this.request = request;
    void (this.storage
      ? this.storage.acquireRuntime(this.runtime.getDocument().id, { signal: request.signal })
      : Promise.resolve({ runtime: this.runtime, document: this.runtime.getDocument(), release: async () => {} })).then((acquisition) => {
      if (request.signal.aborted || this.request !== request) {
        void acquisition.release().catch((error) => this.reportError(error));
        return;
      }
      this.acquisition = acquisition;
      this.updateSnapshot(acquisition.document, true);
      if (this.rootBlockId) {
        this.unsubscribeBlock = acquisition.document.blocks.subscribeBlockNode(this.rootBlockId, () => this.updateSnapshot(acquisition.document, true));
      }
      this.registerRoot();
    }).catch((error) => {
      if (!request.signal.aborted && this.request === request) this.publishSnapshot({ status: "error", error });
    });
    return () => {
      request.abort();
      if (this.request !== request) return;
      this.request = undefined;
      this.unsubscribeBlock?.(); this.unsubscribeBlock = undefined;
      this.unregisterRoot?.(); this.unregisterRoot = undefined;
      this.selectionManager.destroy();
      this.registrations.forEach((release) => release());
      // StrictMode can mount this controller again; its next acquisition needs fresh view bindings.
      this.publishSnapshot({ status: "loading" });
      const acquisition = this.acquisition;
      this.acquisition = undefined;
      if (acquisition) void acquisition.release().catch((error) => this.reportError(error));
    };
  }

  /**
   * Suspends hidden-tab interaction without releasing its document consumer.
   * @param enabled - Whether this occurrence and its UI can receive editing events.
   * @returns Nothing; reacquiring the model is never necessary for activation.
   */
  setEnabled(enabled: boolean): void {
    if (enabled === this.enabled) return;
    this.enabled = enabled;
    if (this.root) this.root.inert = !enabled;
    if (!enabled) {
      this.unregisterRoot?.(); this.unregisterRoot = undefined;
      this.deactivate();
    } else this.registerRoot();
  }

  /**
   * Replaces the DOM root used by this view's events and selection operations.
   *
   * The old root is unregistered first, cancelling its pending selection work.
   * A new root receives the document-view attribute and reflects the enabled state
   * through inert. Subtree roots also receive the block-editor accessibility label.
   * The root is registered for events when the view has a document and is enabled.
   * @param root - Surface element supplied by useEditorRoot, or null when detached.
   * @returns Nothing; other views keep their own roots and registrations.
   */
  setRoot = (root: HTMLElement | null): void => {
    if (root === this.root) return;
    this.unregisterRoot?.(); this.unregisterRoot = undefined;
    this.root = root;
    if (root) {
      root.inert = !this.enabled;
      root.setAttribute(DOCUMENT_VIEW_ATTRIBUTE, "");
      if (this.rootBlockId) {
        root.setAttribute("role", "region");
        root.setAttribute("aria-label", "Block editor");
      }
    }
    this.registerRoot();
  };

  /** Cancels pending caret work for this occurrence, including runtime shutdown and root removal. */
  cancelPendingSelection = (): void => { this.selectionManager.destroy(); };

  private registerRoot(): void {
    if (!this.enabled || !this.root || !this.snapshot.document || this.unregisterRoot) return;
    this.unregisterRoot = this.runtime.editorViews.registerDocumentView(
      this.root, this.snapshot.document, this.rootBlockId, this.snapshot.api, this.deactivate, this.cancelPendingSelection,
    );
  }

  /**
   * Updates the state read by EditorView without acquiring or replacing its runtime.
   *
   * A subtree is loading until its root block has been observed in this controller.
   * If that root later disappears, the state becomes missing so the document can stay
   * retained and undo can restore the block. A full-document view is always available
   * once its document is supplied. Subscribers are notified only when the document,
   * status, or retention flag changes; ordinary content edits use block subscriptions.
   *
   * @param document - The document already supplied by the runtime or its acquisition.
   * @param retained - Whether this mount has completed its acquisition; defaults to false.
   * @returns Nothing; publishes this controller as the view API when state changes.
   */
  private updateSnapshot(document: DocumentModel, retained = false): void {
    const sameDocument = this.snapshot.document === document;
    let status: EditorViewSnapshot["status"] = "available";
    if (this.rootBlockId) {
      if (document.blocks.hasBlock(this.rootBlockId)) this.hasSeenRootBlock = true;
      else status = this.hasSeenRootBlock ? "missing" : "loading";
    }
    if (sameDocument && this.snapshot.status === status && this.snapshot.retained === retained) return;
    this.publishSnapshot({ status, document, api: this, retained });
  }

  private publishSnapshot(snapshot: EditorViewSnapshot): void {
    this.snapshot = snapshot;
    this.listeners.forEach((listener) => listener());
  }

  private reportError(error: unknown): void {
    // Releases are asynchronous; keep failures observable after React has unmounted.
    console.error(error);
  }
}
