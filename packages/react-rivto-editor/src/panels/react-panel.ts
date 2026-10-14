import type { DocumentModel } from "@chulane/document-model";
import { ModeManager, EmbeddingPanel, type PanelAPI, type ModeManagerApi } from "@chulane/rivto";
import type { ReactEditorApi } from "../editor/types";
import { PanelClipboardManager } from "../managers/clipboard/panel-clipboard-manager";
import { PANEL_ATTRIBUTE } from "../managers/events/panel-dom";
import { PanelEventManager } from "../managers/events/panel-event-manager";
import { PanelKeyboardManager } from "../managers/keyboard/panel-keyboard-manager";
import type { PanelSelectionApi } from "../managers/selection/api";
import { PanelSelectionManager } from "../managers/selection/panel-selection-manager";
import { PanelSlashCommandManager } from "../managers/slash/panel-slash-command-manager";
import type { PanelOptions, PanelSnapshot, ReactPanelApi } from "./types";

/**
 * Connects one EditorPanel or EditorEmbed component to its document, DOM root, and local managers.
 *
 * Each mounted component has its own panel, including repeated panels of the
 * same document and embedded subtrees. Blocks, history, extension registrations,
 * and document lifetime belong to the supplied ReactEditorApi and its owner.
 * The panel exposes ReactPanelApi to components and event handlers while
 * keeping mount, DOM registrations, and local cleanup inside the React panel lifecycle.
 *
 * Creating the panel does not acquire a document. With EditorStorage, the caller
 * retains the acquisition; without storage the caller keeps owning the React editor.
 * The panel's rootBlockId limits selection and navigation to one subtree.
 * Its registered DOM root determines which panel receives local events and shortcuts.
 * Selection reads are empty when another registered panel owns the current selection.
 *
 * Manager methods and subscriptions keep using their original document after a
 * focus change. Transaction callbacks are synchronous: after awaiting external work,
 * call the same panel's managers again rather than expecting a global editing context.
 * Closing this panel cancels pending DOM work and local registrations, then releases
 * its local subscriptions. Other panels keep their bindings and shared React editor.
 *
 * React StrictMode may replay the owning hook effect after cleanup. The hook
 * destroys the previous panel and creates a fresh instance with fresh selection
 * managers and local bindings. Shared editor ownership never changes during this replay.
 *
 * Creates and connects the panel only after the owning React hook commits.
 * React integrations must use EditorPanel or EditorEmbed, never construct this
 * instance manually or during render. Server-side rendering and the first client
 * render show loading without creating a panel or acquiring local resources.
 * Block boundaries and root protection are configured by the concrete panel.
 * The independent element root selects document elements when null.
 * Construction connects local resources; destroy() releases them permanently.
 * A destroyed instance is never reused by a later mount of the hook.
 */
export class ReactPanel implements ReactPanelApi {
  readonly mode: ModeManagerApi;
  readonly events: PanelEventManager;
  readonly keyboard: PanelKeyboardManager;
  readonly clipboard: PanelClipboardManager;
  readonly slashCommands: PanelSlashCommandManager;
  readonly id = crypto.randomUUID();
  private selectionManager: PanelSelectionManager;
  private root: HTMLElement | null = null;
  private enabled = true;
  private snapshot: PanelSnapshot = { status: "loading" };
  private readonly listeners = new Set<() => void>();
  private readonly deactivationListeners = new Set<() => void>();
  private readonly registrations = new Set<() => void>();
  private unregisterRoot: (() => void) | undefined;
  private unsubscribeBlock: (() => void) | undefined;
  private unsubscribeMode: (() => void) | undefined;
  private destroyed = false;
  private hasSeenRootBlock = false;

  /**
   * Creates local managers, retains the block-card projection, and connects panel subscriptions.
   *
   * Internal construction is owned by the EditorPanel/EditorEmbed hook effect.
   * React callers must use those components rather than instantiate this class
   * manually. Construction may reconcile document elements through the projection.
   * Partial setup is released before a construction failure is rethrown.
   * @param editor - Shared React editor permanently bound to this panel's document.
   * @param corePanel - Fixed core panel supplying independent block and element boundaries, bounded operations and root protection rules.
   * @param options - Optional shared presentation mode for this displayed occurrence, independent of document ownership.
   * @throws If the core panel belongs to another editor, the shared editor is destroyed, or resource setup fails.
   */
  constructor(
    readonly editor: ReactEditorApi,
    private readonly corePanel: PanelAPI,
    options: PanelOptions = {},
  ) {
    if (
      corePanel.document.getDocument() !== editor.getDocument() ||
      corePanel.document.blocks !== editor.blocks
    ) {
      throw new Error("Panel and React editor must use the same document editor");
    }
    this.mode = options.mode ?? new ModeManager();
    this.events = new PanelEventManager(editor.events, this, editor.panels);
    this.keyboard = new PanelKeyboardManager(editor.keyboard, this);
    this.selectionManager = new PanelSelectionManager(this, this.corePanel.document.selection);
    this.clipboard = new PanelClipboardManager(editor.clipboard, this);
    this.slashCommands = new PanelSlashCommandManager(editor.slashCommands, this);
    try {
      /** Connects the concrete panel's block-card projection and retains its release callback for cleanup. */
      this.registrations.add(
        editor.blockElements.maintainBlockCards(
          corePanel instanceof EmbeddingPanel ? null : (corePanel.rootBlockId ?? null),
          corePanel.rootElementId,
        ),
      );
      this.updateSnapshot(this.corePanel.document.getDocument(), true);
      // A subtree root can disappear and return through undo while its document remains retained.
      if (this.corePanel.rootBlockId) {
        this.unsubscribeBlock = this.corePanel.document.blocks.subscribeBlockNode(
          this.corePanel.rootBlockId,
          () => this.updateSnapshot(this.corePanel.document.getDocument(), true),
        );
      }
      // Keep edits made in different presentation modes out of the same undo capture.
      this.unsubscribeMode = this.mode.subscribe(() =>
        this.corePanel.document.history.stopCapturing(),
      );
    } catch (error) {
      try {
        this.destroy();
      } catch (cleanupError) {
        throw new AggregateError([error, cleanupError], "Panel construction and cleanup failed");
      }
      throw error;
    }
  }

  /** @inheritdoc PanelAPI.document */
  get document(): PanelAPI["document"] {
    return this.corePanel.document;
  }
  /** @inheritdoc PanelAPI.documentId */
  get documentId(): PanelAPI["documentId"] {
    return this.corePanel.documentId;
  }
  /** @inheritdoc PanelAPI.rootBlockId */
  get rootBlockId(): PanelAPI["rootBlockId"] {
    return this.corePanel.rootBlockId;
  }
  /** @inheritdoc PanelAPI.rootElementId */
  get rootElementId(): PanelAPI["rootElementId"] {
    return this.corePanel.rootElementId;
  }
  /** @inheritdoc PanelAPI.blocks */
  get blocks(): PanelAPI["blocks"] {
    return this.corePanel.blocks;
  }
  /** @inheritdoc PanelAPI.elements */
  get elements(): PanelAPI["elements"] {
    return this.corePanel.elements;
  }
  /** @inheritdoc PanelAPI.subscribe */
  readonly subscribe = (listener: () => void): (() => void) => this.corePanel.subscribe(listener);
  /** @inheritdoc PanelAPI.batchUpdates */
  batchUpdates<Result>(operation: () => Result): Result {
    return this.corePanel.batchUpdates(operation);
  }
  /** @inheritdoc PanelAPI.batchUpdatesWithoutHistory */
  batchUpdatesWithoutHistory<Result>(operation: () => Result): Result {
    return this.corePanel.batchUpdatesWithoutHistory(operation);
  }

  /** Selection operations for this occurrence; lifecycle remains internal to this panel instance. */
  get selection(): PanelSelectionApi {
    return this.selectionManager;
  }

  /**
   * Returns the current snapshot without allocating a new object on each read.
   * @returns The same snapshot object until document, availability, or retention changes.
   */
  readonly getSnapshot = (): PanelSnapshot => this.snapshot;

  /**
   * Returns the DOM root currently available to this panel's interaction handlers.
   * @returns The assigned root, or null when no root is assigned or the panel is disabled.
   */
  readonly getRoot = (): HTMLElement | null => (this.enabled ? this.root : null);

  /** Observes availability changes. @param listener - Loading-state observer. @returns Unsubscribe callback. */
  readonly subscribeAvailability = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };

  /**
   * Replaces the DOM root used by this panel's events and selection operations.
   *
   * The old root is unregistered first, cancelling its pending selection work.
   * A new root receives the document-panel attribute and reflects the enabled state
   * through inert. Subtree roots also receive the block-editor accessibility label.
   * The root is registered for events when the panel has a document and is enabled.
   * @param nextRoot - Surface element supplied by useEditorRoot, or null when detached.
   * @returns Nothing; other panels keep their own roots and registrations.
   */
  readonly setRoot = (nextRoot: HTMLElement | null): void => {
    if (nextRoot === this.root) {
      return;
    }
    this.unregisterRoot?.();
    this.unregisterRoot = undefined;
    this.root = nextRoot;
    if (this.root) {
      this.root.inert = !this.enabled;
      this.root.setAttribute(PANEL_ATTRIBUTE, "");
      if (this.corePanel.rootBlockId) {
        this.root.setAttribute("role", "region");
        this.root.setAttribute("aria-label", "Block editor");
      }
    }
    this.registerCurrentDOMRoot();
  };

  /** @param listener - Closes transient UI when another panel becomes active. @returns Unsubscribe callback. */
  readonly subscribeDeactivation = (listener: () => void): (() => void) => {
    this.deactivationListeners.add(listener);
    return () => {
      this.deactivationListeners.delete(listener);
    };
  };

  /**
   * Retains cleanup for an event or keyboard registration made by this panel.
   * @param dispose - Removes one local registration without destroying the shared manager.
   * @returns An idempotent disposer; destroy() also calls it if it is still retained.
   * @throws If panel destruction has started, or if the returned disposer's cleanup fails.
   */
  readonly registerCleanup = (dispose: () => void): (() => void) => {
    if (this.destroyed) {
      throw new Error("React panel is destroyed");
    }
    let active = true;
    const release = () => {
      if (!active) {
        return;
      }
      active = false;
      this.registrations.delete(release);
      dispose();
    };
    this.registrations.add(release);
    return release;
  };

  /**
   * Permanently releases local panel bindings and root availability observers.
   *
   * The loading owner retains the shared editor before creating any panel. This
   * panel never acquires a second consumer from ambient storage. Cancelling
   * a load and releasing late results belong to that owner, while this panel
   * observes whether its selected block is currently available.
   *
   * Cleanup removes local projections, root subscriptions, pending DOM selection,
   * and local registrations, and leaves release of the shared editor to its explicit owner.
   * The owner reports asynchronous release failures because React cannot await cleanup.
   * StrictMode effect replay creates a new panel after destroying the previous
   * instance, with fresh selection managers and subscriptions; cancelled DOM work
   * from this instance is never revived. Repeated destruction cannot dispose a
   * later panel created by the same hook or another occurrence of the document.
   * Every retained cleanup is attempted even when another cleanup throws.
   *
   * @returns Nothing; repeated calls are harmless and a destroyed panel cannot be reattached.
   * @throws After all cleanup has run if one or more retained cleanup callbacks fail.
   */
  readonly destroy = (): void => {
    if (this.destroyed) {
      return;
    }
    this.destroyed = true;
    const errors: unknown[] = [];
    const cleanups = [
      this.unsubscribeMode,
      this.unsubscribeBlock,
      this.unregisterRoot,
      () => this.selectionManager.destroy(),
      ...this.registrations,
    ];
    this.unsubscribeMode = undefined;
    this.unsubscribeBlock = undefined;
    this.unregisterRoot = undefined;
    this.root = null;
    for (const cleanup of cleanups) {
      try {
        cleanup?.();
      } catch (error) {
        errors.push(error);
      }
    }
    this.registrations.clear();
    this.deactivationListeners.clear();
    try {
      this.publishSnapshot({ status: "loading" });
    } catch (error) {
      errors.push(error);
    }
    this.listeners.clear();
    if (errors.length === 1) {
      throw errors[0];
    }
    if (errors.length > 1) {
      throw new AggregateError(errors, "Panel cleanup failed");
    }
  };

  /**
   * Suspends hidden-tab interaction without changing the owner’s document retention.
   * @param nextEnabled - Whether this occurrence and its UI can receive editing events.
   * @returns Nothing; reacquiring the model is never necessary for activation.
   */
  readonly setEnabled = (nextEnabled: boolean): void => {
    if (nextEnabled === this.enabled) {
      return;
    }
    this.enabled = nextEnabled;
    if (this.root) {
      this.root.inert = !this.enabled;
    }
    if (!this.enabled) {
      this.unregisterRoot?.();
      this.unregisterRoot = undefined;
      this.deactivate();
    } else {
      this.registerCurrentDOMRoot();
    }
  };

  /** @returns Nothing after notifying local transient UI that this panel lost focus. */
  private readonly deactivate = (): void => {
    this.deactivationListeners.forEach((listener) => listener());
  };

  /**
   * Registers the current DOM surface for panel event routing and focus tracking.
   *
   * Called after root assignment or reactivation of the connected panel. Does nothing
   * while the panel is disabled, its root or document is unavailable, or the
   * current root is already registered. Unlike construction, this method does not
   * acquire projections or connect panel subscriptions: the DOM surface can be
   * replaced, including when switching page and edgeless modes, while those
   * resources remain connected.
   *
   * Retains the registry's cleanup callback for root replacement, disabling, and
   * unmounting. Registration also supplies callbacks that notify transient UI
   * when the panel is deactivated and cancel pending DOM selection work when
   * the root is removed or the shared editor begins destruction.
   *
   * @returns Nothing; a successful registration is retained in unregisterRoot.
   * @throws If registration is attempted after the shared editor's registration owner has started destruction.
   */
  private readonly registerCurrentDOMRoot = (): void => {
    // Root assignment and reactivation can arrive separately; register only when ready and only once.
    if (
      this.destroyed ||
      !this.enabled ||
      !this.root ||
      !this.snapshot.document ||
      this.unregisterRoot
    ) {
      return;
    }
    // Route events to this occurrence and retain cleanup for root replacement, deactivation, or unmount.
    this.unregisterRoot = this.editor.panels.registerPanel(
      this.root,
      this.snapshot.document,
      this.corePanel.rootBlockId,
      this.snapshot.api,
      this.deactivate,
      // Cancels pending caret work for this occurrence, including runtime shutdown and root removal.
      () => this.selectionManager.destroy(),
    );
  };

  /**
   * Updates the state read by EditorPanel or EditorEmbed without acquiring or replacing its runtime.
   *
   * A subtree is loading until its root block has been observed in this panel.
   * If that root later disappears, the state becomes missing so the document can stay
   * retained and undo can restore the block. A full-document panel is always available
   * once its document is supplied. Subscribers are notified only when the document,
   * status, or retention flag changes; ordinary content edits use block subscriptions.
   *
   * @param document - The document already supplied by the runtime or its acquisition.
   * @param retained - Whether this mount has installed its local bindings; defaults to false.
   * @returns Nothing; publishes this panel as the panel API when state changes.
   */
  private readonly updateSnapshot = (document: DocumentModel, retained = false): void => {
    const sameDocument = this.snapshot.document === document;
    let status: PanelSnapshot["status"] = "available";
    if (this.corePanel.rootBlockId) {
      if (document.blocks.hasBlock(this.corePanel.rootBlockId)) {
        this.hasSeenRootBlock = true;
      } else {
        status = this.hasSeenRootBlock ? "missing" : "loading";
      }
    }
    if (sameDocument && this.snapshot.status === status && this.snapshot.retained === retained) {
      return;
    }
    this.publishSnapshot({ status, document, api: this, retained });
  };

  /**
   * Replaces the panel snapshot and notifies subscribers synchronously.
   *
   * @param nextSnapshot - Immutable panel snapshot received from the core panel subscription.
   */
  private readonly publishSnapshot = (nextSnapshot: PanelSnapshot): void => {
    this.snapshot = nextSnapshot;
    this.listeners.forEach((listener) => listener());
  };
}
