import type { DocumentModel } from "@chulane/document-model";
import type { EditorAcquisition, EditorStorage } from "../../editor-storage";
import type { ReactEditor } from "../../types";
import type { SelectionCapability } from "../../capabilities";
import { DOCUMENT_VIEW_ATTRIBUTE, type DocumentViewScope } from "./document-view";

/** Immutable loading state observed by the EditorView boundary. */
export interface EditorViewSnapshot {
  readonly status: "loading" | "available" | "missing" | "error";
  readonly document?: DocumentModel;
  readonly api?: ReactEditor;
  readonly error?: unknown;
  readonly retained?: boolean;
}

/** Owns one rendered occurrence, its document consumer, and local registrations. */
export class EditorViewController implements DocumentViewScope {
  readonly id = crypto.randomUUID();
  private root: HTMLElement | null = null;
  private enabled = true;
  private snapshot: EditorViewSnapshot = { status: "loading" };
  private readonly listeners = new Set<() => void>();
  private readonly deactivationListeners = new Set<() => void>();
  private readonly registrations = new Set<() => void>();
  private acquisition?: EditorAcquisition;
  private request?: AbortController;
  private unregisterRoot?: () => void;
  private unsubscribeBlock?: () => void;
  private seen = false;

  /**
   * Prepares a view without acquiring or changing document state during render.
   * Loaded models can be read immediately, including server-side rendering.
   * @param editor - Shared runtime permanently bound to this view's document.
   * @param rootBlockId - Optional subtree; omitted to display the full document.
   * @param storage - Optional host cache from EditorStorageContext; omitted for a caller-owned standalone editor.
   */
  constructor(readonly editor: ReactEditor, readonly rootBlockId?: string, private readonly storage?: EditorStorage) { this.bind(editor.getDocument()); }

  /** @returns Current immutable document/loading snapshot. */
  getSnapshot = (): EditorViewSnapshot => this.snapshot;
  /** @returns This occurrence's mounted surface root, or null before/after mount. */
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

  /** @param dispose - Local event/shortcut registration. @returns Idempotent owned cleanup. */
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
   * Acquires this view's consumer; cancellation does not cancel another view's load.
   * Cleanup handles StrictMode remounts and late acquisition completion.
   * @returns Cleanup removing local subscriptions, roots, registrations, and the consumer.
   */
  mount(): () => void {
    const request = new AbortController();
    this.request = request;
    void (this.storage
      ? this.storage.acquireEditor(this.editor.getDocument().id, { signal: request.signal })
      : Promise.resolve({ editor: this.editor, document: this.editor.getDocument(), release: async () => {} })).then((acquisition) => {
      if (request.signal.aborted || this.request !== request) {
        void acquisition.release().catch((error) => this.reportError(error));
        return;
      }
      this.acquisition = acquisition;
      this.bind(acquisition.document, true);
      if (this.rootBlockId) {
        this.unsubscribeBlock = acquisition.document.blocks.subscribeBlockNode(this.rootBlockId, () => this.bind(acquisition.document, true));
      }
      this.registerRoot();
    }).catch((error) => {
      if (!request.signal.aborted && this.request === request) this.publish({ status: "error", error });
    });
    return () => {
      request.abort();
      if (this.request !== request) return;
      this.request = undefined;
      this.unsubscribeBlock?.(); this.unsubscribeBlock = undefined;
      this.unregisterRoot?.(); this.unregisterRoot = undefined;
      this.registrations.forEach((release) => release());
      // StrictMode can mount this controller again; its next acquisition needs fresh view bindings.
      this.publish({ status: "loading" });
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

  /** @param root - Surface registered by the existing useEditorRoot callback. @returns Nothing. */
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

  private registerRoot(): void {
    if (!this.enabled || !this.root || !this.snapshot.document || this.unregisterRoot) return;
    this.unregisterRoot = this.editor.events.registerDocumentView(
      this.root, this.snapshot.document, this.rootBlockId, this.snapshot.api, this.deactivate,
    );
  }

  /**
   * Scopes selection and DOM events to a rendered occurrence of this document.
   *
   * The returned API acquires no document and shares presentation registrations
   * with its host. Managers delegate directly to the permanently bound core,
   * so retained callbacks keep using their source after focus changes.
   * Subscriptions remain attached to the model used when they are registered.
   * Synchronous transaction callbacks use that same core; asynchronous
   * work must call the returned managers again after awaiting.
   * Selection reads return empty values outside the selected document and
   * occurrence; local shortcuts and event registrations are owned by the scope.
   *
   * The controller's rootBlockId constrains selection and navigation. Its mounted
   * DOM root routes local events and shortcuts; the controller owns their cleanup.
   * Document managers, registries, and lifecycle remain shared by these views.
   * Retained manager methods use this model on every call, including after focus
   * changes. Transaction callbacks are synchronous; after awaiting, call the
   * bound managers again rather than relying on a surrounding context.
   * The API has no independent destruction or acquisition ownership.
   *
   * @param document - Fixed source model displayed by this occurrence.
   * @returns Document-bound API sharing registries, DOM events, and lifecycle with this editor.
   */
  private createApi(document: DocumentModel): ReactEditor {
    const events = this.editor.events.forView(this);
    const keyboard = this.editor.keyboard.forView(this);
    const run = events.runInView;
    const selection = this.editor.selection;
    let checkedSelection: ReturnType<typeof selection.snapshot>;
    let checkedRevision = -1; let contained = false;
    const containsSelection = (value: Parameters<SelectionCapability["set"]>[0]) => !this.rootBlockId || value.blocks.every(({ id }) => {
      let current: string | null | undefined = id;
      while (current) { if (current === this.rootBlockId) return true; current = document.blocks.getParentId(current); }
      return false;
    });
    const ownsSelection = () => {
      if (this.getRoot() === null || this.editor.events.getRoot() !== this.getRoot()) return false;
      const value = selection.snapshot();
      if (!value) return false;
      if (!this.rootBlockId) return true;
      // Rows share an immutable snapshot; membership is checked once per revision.
      if (value !== checkedSelection || document.blocks.revision !== checkedRevision) {
        checkedSelection = value; checkedRevision = document.blocks.revision; contained = containsSelection(value);
      }
      return contained;
    };
    const selectionApi: SelectionCapability = {
      subscribe: selection.subscribe.bind(selection),
      clear: selection.clear.bind(selection),
      readDOM: () => run(() => selection.readDOM()),
      scheduleIfSelectionUnchanged: (...args: Parameters<SelectionCapability["scheduleIfSelectionUnchanged"]>) => run(() => selection.scheduleIfSelectionUnchanged(...args)),
      get hasPendingSelectionCallback() { return run(() => selection.hasPendingSelectionCallback); },
      get: () => ownsSelection() ? selection.get() : undefined,
      snapshot: () => ownsSelection() ? selection.snapshot() : undefined,
      set: (value: Parameters<SelectionCapability["set"]>[0]) => run(() => {
        if (value?.type === "selection" && Array.isArray(value.blocks) && !containsSelection(value)) { selection.clear(); return; }
        selection.set(value);
      }),
      isBlockSelected: (id: string) => ownsSelection() && selection.isBlockSelected(id),
      isElementSelected: (id: string) => ownsSelection() && selection.isElementSelected(id),
      delete: () => { if (ownsSelection()) run(() => selection.delete()); },
      restoreDOM: (value = selectionApi.get(), options?: Parameters<SelectionCapability["restoreDOM"]>[1]) =>
        Boolean(value) && run(() => selection.restoreDOM(value, options)),
    };
    const editor = this.editor;
    return {
      documentId: document.id,
      rootBlockId: this.rootBlockId,
      events,
      keyboard,
      selection: selectionApi,
      blocks: editor.blocks,
      blockTypes: editor.blockTypes,
      blockListProps: editor.blockListProps,
      elements: editor.elements,
      mode: editor.mode,
      commands: editor.commands,
      history: editor.history,
      renderers: editor.renderers,
      views: editor.views,
      clipboard: editor.clipboard,
      surfaces: editor.surfaces,
      extensions: editor.extensions,
      slashCommands: editor.slashCommands,
      get revision() { return editor.revision; },
      get createDefaultBlock() { return editor.createDefaultBlock; },
      set createDefaultBlock(value) { editor.createDefaultBlock = value; },
      get isEmptyBlock() { return editor.isEmptyBlock; },
      set isEmptyBlock(value) { editor.isEmptyBlock = value; },
      installDefaultWriting: (options) => editor.installDefaultWriting(options),
      subscribe: (listener) => editor.subscribe(listener),
      getDocument: () => document,
      // A view releases its acquisition through mount cleanup; it never destroys the shared editor.
      destroy: () => {},
    };
  }

  private bind(document: DocumentModel, retained = false): void {
    const existing = this.snapshot.document === document;
    const api = existing && this.snapshot.api ? this.snapshot.api : this.createApi(document);
    let status: EditorViewSnapshot["status"] = "available";
    if (this.rootBlockId) {
      if (document.blocks.hasBlock(this.rootBlockId)) this.seen = true;
      else status = this.seen ? "missing" : "loading";
    }
    if (existing && this.snapshot.status === status && this.snapshot.retained === retained) return;
    this.publish({ status, document, api, retained });
  }

  private publish(snapshot: EditorViewSnapshot): void {
    this.snapshot = snapshot;
    this.listeners.forEach((listener) => listener());
  }

  private reportError(error: unknown): void {
    // Releases are asynchronous; keep failures observable after React has unmounted.
    console.error(error);
  }
}
