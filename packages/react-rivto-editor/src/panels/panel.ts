import type { DocumentModel } from "@chulane/document-model";
import { ModeManager, type DocumentEditorAPI, type ModeManagerApi } from "@chulane/rivto";
import type { ReactEditorApi } from "../editor/types";
import { ViewClipboardManager } from "../managers/clipboard/view-clipboard-manager";
import { DOCUMENT_VIEW_ATTRIBUTE } from "../managers/events/document-view";
import { ViewEventManager } from "../managers/events/view-event-manager";
import { ViewKeyboardManager } from "../managers/keyboard/view-keyboard-manager";
import type { ViewSelectionApi } from "../managers/selection/api";
import { ViewSelectionManager } from "../managers/selection/view-selection-manager";
import { ViewSlashCommandManager } from "../managers/slash/view-slash-command-manager";
import type { PanelBlocks } from "./panel-blocks";
import { PanelElements } from "./panel-elements";
import type { OpenPanelBlock, PanelOptions } from "./types";
import type { PanelSnapshot, PanelInstance } from "./types";

/**
 * Connects one EditorPanel or EditorEmbed component to its document, DOM root, and local managers.
 *
 * Each mounted component has its own panel, including repeated views of the
 * same document and embedded subtrees. Blocks, history, extension registrations,
 * and document lifetime belong to the supplied ReactEditorApi and its owner.
 * The panel exposes PanelAPI to components and event handlers while
 * keeping mount, DOM registrations, and local cleanup inside the React view lifecycle.
 *
 * Creating the panel does not acquire a document. With EditorStorage, the caller
 * retains the acquisition; without storage the caller keeps owning the React editor.
 * The panel's rootBlockId limits selection and navigation to one subtree.
 * Its registered DOM root determines which view receives local events and shortcuts.
 * Selection reads are empty when another registered view owns the current selection.
 *
 * Manager methods and subscriptions keep using their original document after a
 * focus change. Transaction callbacks are synchronous: after awaiting external work,
 * call the same view's managers again rather than expecting a global editing context.
 * Closing this view cancels pending DOM work and local registrations, then releases
 * its local subscriptions. Other views keep their bindings and shared React editor.
 *
 * React StrictMode may mount the same panel again after cleanup. Its identity
 * stays stable, but the next mount creates a fresh selection manager and installs
 * fresh local bindings. Shared editor ownership never changes during this mount replay.
 *
 * Prepares a view without acquiring or changing document state during render.
 * Loaded models can be read immediately, including server-side rendering.
 * Block boundaries and root protection are configured by the concrete panel.
 * The independent element root selects document elements when null.
 * Local resources are connected by mount(); construction only prepares the panel.
 */
export abstract class Panel implements PanelInstance {
  readonly document: DocumentEditorAPI;
  readonly rootBlockId: string | undefined;
  readonly rootElementId: string | null;
  readonly mode: ModeManagerApi;
  readonly openBlock: OpenPanelBlock | undefined;
  readonly elements: PanelElements;
  readonly events: ViewEventManager;
  readonly keyboard: ViewKeyboardManager;
  readonly clipboard: ViewClipboardManager;
  readonly slashCommands: ViewSlashCommandManager;
  readonly id = crypto.randomUUID();
  private releasePanel: (() => void) | undefined;
  private selectionManager: ViewSelectionManager;
  private root: HTMLElement | null = null;
  private enabled = true;
  private snapshot: PanelSnapshot = { status: "loading" };
  private readonly listeners = new Set<() => void>();
  private readonly deactivationListeners = new Set<() => void>();
  private readonly registrations = new Set<() => void>();
  private unregisterRoot: (() => void) | undefined;
  private unsubscribeBlock: (() => void) | undefined;
  private hasSeenRootBlock = false;

  /**
   * Prepares shared panel bindings without subscriptions or document mutations.
   * @param editor - Shared React editor permanently bound to this panel's document.
   * @param options - Fixed block boundary, independent element root, navigation and optional shared mode.
   * @param blocks - Concrete panel's bounded block operations and root protection rules.
   */
  protected constructor(readonly editor: ReactEditorApi, options: PanelOptions, readonly blocks: PanelBlocks) {
    this.document = editor.document;
    this.rootBlockId = options.rootBlockId ?? undefined;
    this.rootElementId = options.rootElementId ?? null;
    this.mode = options.mode ?? new ModeManager();
    this.openBlock = options.openBlock;
    this.elements = new PanelElements(this.document.elements, this.document.getDocument(), this.rootElementId);
    this.events = new ViewEventManager(editor.events, this, editor.panels);
    this.keyboard = new ViewKeyboardManager(editor.keyboard, this);
    this.selectionManager = new ViewSelectionManager(this, this.document.selection);
    this.clipboard = new ViewClipboardManager(editor.clipboard, this);
    this.slashCommands = new ViewSlashCommandManager(editor.slashCommands, this);
    this.updateSnapshot(this.document.getDocument());
  }

  /** Selection operations for this occurrence; lifecycle remains internal to this panel instance. */
  get selection(): ViewSelectionApi { return this.selectionManager; }
  /** Persisted identity of the document displayed by this occurrence. */
  get documentId(): string { return this.editor.document.getDocument().id; }
  /** Connects the concrete panel's block-card projection and returns its release callback. */
  protected abstract acquireProjection(): () => void;

  /**
   * Returns the current snapshot without allocating a new object on each read.
   * @returns The same snapshot object until document, availability, or retention changes.
   */
  readonly getSnapshot = (): PanelSnapshot => this.snapshot;

  /**
   * Returns the DOM root currently available to this view's interaction handlers.
   * @returns The assigned root, or null when no root is assigned or the view is disabled.
   */
  readonly getRoot = (): HTMLElement | null => this.enabled ? this.root : null;

  /** @param listener - Loading-state observer. @returns Unsubscribe callback. */
  readonly subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => { this.listeners.delete(listener); };
  };

  /** @returns Nothing after notifying local transient UI that this view lost focus. */
  private readonly deactivate = (): void => { this.deactivationListeners.forEach((listener) => listener()); };

  /**
   * Replaces the DOM root used by this view's events and selection operations.
   *
   * The old root is unregistered first, cancelling its pending selection work.
   * A new root receives the document-view attribute and reflects the enabled state
   * through inert. Subtree roots also receive the block-editor accessibility label.
   * The root is registered for events when the view has a document and is enabled.
   * @param nextRoot - Surface element supplied by useEditorRoot, or null when detached.
   * @returns Nothing; other views keep their own roots and registrations.
   */
  readonly setRoot = (nextRoot: HTMLElement | null): void => {
    if (nextRoot === this.root) return;
    this.unregisterRoot?.(); this.unregisterRoot = undefined;
    this.root = nextRoot;
    if (this.root) {
      this.root.inert = !this.enabled;
      this.root.setAttribute(DOCUMENT_VIEW_ATTRIBUTE, "");
      if (this.rootBlockId) {
        this.root.setAttribute("role", "region");
        this.root.setAttribute("aria-label", "Block editor");
      }
    }
    this.registerRoot();
  };

  /** Cancels pending caret work for this occurrence, including runtime shutdown and root removal. */
  private readonly cancelPendingSelection = (): void => { this.selectionManager.destroy(); };

  /** @param listener - Closes transient UI when another view becomes active. @returns Unsubscribe callback. */
  readonly subscribeDeactivation = (listener: () => void): () => void => {
    this.deactivationListeners.add(listener);
    return () => { this.deactivationListeners.delete(listener); };
  };

  /**
   * Retains cleanup for an event or keyboard registration made by this view.
   * @param dispose - Removes one local registration without destroying the shared manager.
   * @returns An idempotent disposer; mount cleanup also calls it if it is still retained.
   */
  readonly own = (dispose: () => void): () => void => {
    let active = true;
    const release = () => {
      if (!active) return;
      active = false;
      this.registrations.delete(release);
      dispose();
    };
    this.registrations.add(release);
    return release;
  };

  /**
   * Mounts local view bindings and observes the selected block root, if any.
   *
   * The loading owner retains the shared editor before mounting any panel. This
   * panel never acquires a second consumer from ambient storage. Cancelling
   * a load and releasing late results belong to that owner, while this panel
   * observes whether its selected block is currently available.
   *
   * The returned cleanup removes local projections, root subscriptions, pending DOM selection,
   * and local registrations, and leaves release of the shared editor to its explicit owner.
   * The owner reports asynchronous release failures because React cannot await cleanup.
   * StrictMode can reuse this panel: the next mount creates a fresh selection
   * manager and fresh local subscriptions without reviving the previous DOM work.
   * @returns Idempotent cleanup for this mount. Call it before mounting the same panel again; a completed cleanup cannot dispose a later mount.
   */
  readonly mount = (): () => void => {
    this.releasePanel = this.acquireProjection();
    if (!this.snapshot.api) this.selectionManager = new ViewSelectionManager(this, this.document.selection);
    this.updateSnapshot(this.document.getDocument(), true);
    if (this.rootBlockId) this.unsubscribeBlock = this.document.blocks.subscribeBlockNode(this.rootBlockId, () => this.updateSnapshot(this.document.getDocument(), true));
    const unsubscribeMode = this.mode.subscribe(() => this.document.history.stopCapturing());
    this.registerRoot();
    let active = true;
    return () => {
      if (!active) return;
      active = false;
      unsubscribeMode();
      this.releasePanel?.(); this.releasePanel = undefined;
      this.unsubscribeBlock?.(); this.unsubscribeBlock = undefined;
      this.unregisterRoot?.(); this.unregisterRoot = undefined;
      this.selectionManager.destroy();
      this.registrations.forEach(release => release());
      this.publishSnapshot({ status: "loading" });
    };
  };

  /**
   * Suspends hidden-tab interaction without changing the owner’s document retention.
   * @param nextEnabled - Whether this occurrence and its UI can receive editing events.
   * @returns Nothing; reacquiring the model is never necessary for activation.
   */
  readonly setEnabled = (nextEnabled: boolean): void => {
    if (nextEnabled === this.enabled) return;
    this.enabled = nextEnabled;
    if (this.root) this.root.inert = !this.enabled;
    if (!this.enabled) {
      this.unregisterRoot?.(); this.unregisterRoot = undefined;
      this.deactivate();
    } else this.registerRoot();
  };

  private readonly registerRoot = (): void => {
    if (!this.enabled || !this.root || !this.snapshot.document || this.unregisterRoot) return;
    this.unregisterRoot = this.editor.panels.registerDocumentView(
      this.root, this.snapshot.document, this.rootBlockId, this.snapshot.api, this.deactivate, this.cancelPendingSelection,
    );
  };

  /**
   * Updates the state read by EditorPanel or EditorEmbed without acquiring or replacing its runtime.
   *
   * A subtree is loading until its root block has been observed in this panel.
   * If that root later disappears, the state becomes missing so the document can stay
   * retained and undo can restore the block. A full-document view is always available
   * once its document is supplied. Subscribers are notified only when the document,
   * status, or retention flag changes; ordinary content edits use block subscriptions.
   *
   * @param document - The document already supplied by the runtime or its acquisition.
   * @param retained - Whether this mount has installed its local bindings; defaults to false.
   * @returns Nothing; publishes this panel as the view API when state changes.
   */
  private readonly updateSnapshot = (document: DocumentModel, retained = false): void => {
    const sameDocument = this.snapshot.document === document;
    let status: PanelSnapshot["status"] = "available";
    if (this.rootBlockId) {
      if (document.blocks.hasBlock(this.rootBlockId)) this.hasSeenRootBlock = true;
      else status = this.hasSeenRootBlock ? "missing" : "loading";
    }
    if (sameDocument && this.snapshot.status === status && this.snapshot.retained === retained) return;
    this.publishSnapshot({ status, document, api: this, retained });
  };

  private readonly publishSnapshot = (nextSnapshot: PanelSnapshot): void => {
    this.snapshot = nextSnapshot;
    this.listeners.forEach((listener) => listener());
  };
}
