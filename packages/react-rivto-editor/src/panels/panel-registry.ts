import type { RegistrationOwner } from "../managers/extensions/types";
import type { DocumentModel } from "@chulane/document-model";
import type { EditorMode, SelectionManagerApi } from "@chulane/rivto";
import type { ReactPanelApi } from "./types";
import { PANEL_SELECTOR } from "./panel-dom";

// Window pointer continuations belong to the editor that started the gesture,
// including when the pointer crosses another editor's panel on the same page.
const pointerRoots = new WeakMap<Document, HTMLElement>();
const pointerEventRoots = new WeakMap<Event, HTMLElement>();

/**
 * Owns mounted document roots, focus, and event routing between their panels.
 *
 * Each ReactEditor instance owns its own registry; this is not a global registry
 * of every editor on the page. Panels register with the editor supplying their
 * document, independently of where their DOM roots are nested. An embedding of
 * document A inside document B therefore registers with A's editor, alongside
 * any full-document panels of A, rather than with the surrounding editor of B.
 */
export class PanelRegistry {
  private activeRoot: HTMLElement | null = null;
  private pointerRoot?: HTMLElement;
  private readonly eventPanels = new WeakMap<globalThis.Event, HTMLElement | null>();
  private readonly panels = new Map<
    HTMLElement,
    {
      document: DocumentModel;
      rootBlockId?: string;
      api?: ReactPanelApi;
      deactivate?: () => void;
      cancelSelection?: () => void;
    }
  >();

  /**
   * Creates the registry that tracks mounted panels and their active selection.
   *
   * @param selection - Shared document selection cleared when the active panel changes.
   * Root subscribers reconnect delegated listeners after roots change.
   * @param extensions - Borrowed destruction guard; registration ownership and teardown remain external.
   */
  constructor(
    private readonly selection: Pick<SelectionManagerApi, "clear">,
    private readonly extensions: Pick<RegistrationOwner, "assertActive">,
  ) {}
  private readonly rootListeners = new Set<() => void>();
  /** Observes root registration changes without observing document edits. */
  subscribeRoots(listener: () => void): () => void {
    this.rootListeners.add(listener);
    return () => {
      this.rootListeners.delete(listener);
    };
  }
  /**
   * Returns the API of the last activated panel registered with this document editor.
   *
   * Activation follows focus, pointer-down, input, or keyboard events routed to a
   * panel. Hover alone does not activate it. The panel remains remembered when
   * focus leaves the editor; this is not a query for the browser's focused element.
   * This method does not fall back to getDefault() or activate another panel.
   *
   * @returns The last activated panel's API, or undefined before activation, after
   * its root is removed, or when that root was registered without an API.
   */
  getActive(): ReactPanelApi | undefined {
    return this.activeRoot ? this.getApi(this.activeRoot) : undefined;
  }
  /**
   * Returns the API of the preferred registered panel without consulting activation history.
   *
   * Uses getDefaultRoot(): the first registered full-document panel takes priority
   * over subtree panels, including embeddings. If no full-document panel exists,
   * the first registered subtree is used. Reading this default does not activate it
   * or change the panel remembered by getActive().
   *
   * @returns The chosen panel's API, or undefined when no root is registered or
   * the chosen root has no API. A missing API does not select a different root.
   */
  getDefault(): ReactPanelApi | undefined {
    const root = this.getDefaultRoot();
    return root ? this.getApi(root) : undefined;
  }
  /**
   * Returns the DOM root of the last activated panel registered with this document editor.
   *
   * Focus, pointer-down, input, and keyboard events can activate a panel; hover
   * alone cannot. The root remains remembered when browser focus leaves the editor.
   * For example, interacting with an embedding makes its root active even while
   * getDefaultRoot() still prefers a mounted full-document panel.
   *
   * The remembered root belongs to this ReactEditor's registry. It can be an
   * embedding rendered inside another editor's DOM, but it cannot be a panel
   * registered only with that other editor. Activating another editor's panel
   * leaves this registry's last active root remembered rather than replacing it.
   *
   * @returns The remembered root, or null before activation and after that root
   * is removed. No default is applied; callers that need an initial fallback can
   * use getActiveRoot() ?? getDefaultRoot().
   */
  getActiveRoot(): HTMLElement | null {
    return this.activeRoot;
  }

  /** @returns A new set of all registered roots, including full-document and subtree panels.
   * Later registrations and removals do not change the returned set. */
  getRoots(): ReadonlySet<HTMLElement> {
    return new Set(this.panels.keys());
  }

  /** @returns Whether mounted document panels need focus and pointer lifecycle listeners. */
  get hasPanels(): boolean {
    return this.panels.size > 0;
  }

  /** @param root - Registered editor surface.
   * @returns Its API, or undefined for an unknown root or a registration without an API. */
  getApi(root: HTMLElement): ReactPanelApi | undefined {
    return this.panels.get(root)?.api;
  }

  /**
   * Chooses a registered DOM root by panel scope and registration order, independently of interaction.
   *
   * Prefers the first full-document panel (registered without rootBlockId), even
   * if an embedding registered earlier. When only subtree panels are mounted,
   * uses the first of those. The choice is recomputed from current registrations;
   * it neither reads nor changes the last activated root or browser focus.
   *
   * @returns The first registered full-document root, otherwise the first registered
   * subtree root, or null when no panels are registered.
   */
  getDefaultRoot(): HTMLElement | null {
    // Child refs mount first. Prefer the full document over an embedding until
    // an interaction explicitly activates one of its subtree occurrences.
    for (const [root, panel] of this.panels) {
      if (panel.rootBlockId === undefined) {
        return root;
      }
    }
    return this.panels.keys().next().value ?? null;
  }

  /**
   * Reads the current panel's rendered surface without changing the core mode.
   *
   * The core mode manager belongs to the document and chooses its main presentation.
   * This method reads the receiving DOM occurrence instead: a page embedding
   * returns `block` even inside an `edgeless` document. Scoped event managers use
   * their own panel root; a call without a root uses the active root,
   * falling back to the first full-document panel or first subtree. No additional mode state is stored, and the core mode remains shared.
   * Dispatch captures this value once in `event.mode`; handlers use that snapshot.
   * Panel-specific commands outside dispatch can call this method, while operations
   * that depend on document mode should use `reactEditor.mode.get()`.
   * @param root - Surface to inspect; omitted to choose the active or default root.
   * Explicit null reads the core mode without choosing another root.
   * @returns Current DOM panel's surface kind, or core mode before mounting
   * or when the root has no recognized surface type.
   */
  getSurfaceType(root = this.getActiveRoot() ?? this.getDefaultRoot()): EditorMode {
    const surface = root?.getAttribute("data-rivto-surface");
    if (surface === "block" || surface === "edgeless") {
      return surface;
    }
    return (root ? this.panels.get(root)?.api?.mode.get() : undefined) ?? "block";
  }

  /**
   * Registers one document occurrence and connects shared delegated listeners to its root.
   * @param root - Mounted surface displaying the full document or source subtree.
   * @param document - Source model used for commands within this region.
   * @param rootBlockId - Displayed source root bounding selection and navigation.
   * @param api - Panel-bound API supplied to handlers; omitted only for a region that must not dispatch editing handlers.
   * @param cancelSelection - Cancels pending DOM selection work before removing the root.
   * @param deactivate - Closes this panel's transient UI when it loses focus or is removed.
   * @returns Idempotent cleanup that clears selection when a focused subtree is removed
   * and returns keyboard focus to an enclosing mounted surface, retaining source undo.
   * Full-document surface changes preserve selection when switching presentation modes.
   */
  registerPanel(
    root: HTMLElement,
    document: DocumentModel,
    rootBlockId?: string,
    api?: ReactPanelApi,
    deactivate?: () => void,
    cancelSelection?: () => void,
  ): () => void {
    this.extensions.assertActive();
    const entry = { document, rootBlockId, api, deactivate, cancelSelection };
    this.panels.set(root, entry);
    this.notifyRootsChanged();
    return () => {
      if (this.panels.get(root) !== entry) {
        return;
      }
      this.panels.delete(root);
      entry.cancelSelection?.();
      if (this.pointerRoot === root) {
        this.pointerRoot = undefined;
        if (pointerRoots.get(root.ownerDocument) === root) {
          pointerRoots.delete(root.ownerDocument);
        }
      }
      this.notifyRootsChanged();
      deactivate?.();
      if (this.activeRoot !== root) {
        return;
      }
      this.activeRoot = null;
      // Retain source undo while the target is missing; the next panel interaction chooses its own history again.
      // Replacing a full-document surface (page/canvas) keeps core selection.
      // Removing the active embedded subtree releases its occurrence's selection.
      if (entry.rootBlockId !== undefined) {
        this.selection.clear();
      }
      if (root.contains(root.ownerDocument.activeElement)) {
        const parent = root.parentElement?.closest<HTMLElement>(PANEL_SELECTOR);
        if (parent && this.panels.has(parent)) {
          parent.focus({ preventScroll: true });
        }
      }
    };
  }

  /**
   * Chooses the receiving panel, retaining the origin of a continuing pointer gesture.
   * Hover routes without changing editing focus. Focus, input, and keyboard events
   * activate their panel and deactivate the previous occurrence's transient UI.
   * @param raw - Native event, shared between listener groups.
   * @param attachedRoot - Surface listener's root; omitted for document/window listeners.
   * @returns Receiving root, or undefined when another editor or surface owns the event.
   */
  resolveEventRoot(raw: Event, attachedRoot?: HTMLElement): HTMLElement | undefined {
    const fallback = this.getActiveRoot() ?? this.getDefaultRoot();
    if (!fallback) {
      return;
    }
    const selectionNode =
      raw.type === "selectionchange"
        ? fallback.ownerDocument.getSelection()?.anchorNode
        : undefined;
    const target = selectionNode ?? raw.target;
    const ElementConstructor = fallback.ownerDocument.defaultView!.Element;
    const element =
      target instanceof ElementConstructor ? target : (target as Node | null)?.parentElement;
    const boundary = element?.closest<HTMLElement>(PANEL_SELECTOR);
    const activatesPanel =
      raw.type === "focusin" ||
      raw.type === "pointerdown" ||
      raw.type === "input" ||
      raw.type === "keydown";
    const pointerContinuation =
      raw.type === "pointermove" || raw.type === "pointerup" || raw.type === "pointercancel";
    const gestureRoot = pointerEventRoots.get(raw) ?? pointerRoots.get(fallback.ownerDocument);
    if (pointerContinuation && gestureRoot) {
      pointerEventRoots.set(raw, gestureRoot);
      if (!this.panels.has(gestureRoot)) {
        return;
      }
    }
    // A nested editor owns its nearest panel even when this runtime uses capture listeners.
    if (boundary && !this.panels.has(boundary) && !this.pointerRoot) {
      // Another editor can take focus without discarding this editor's selection.
      // Keep the last occurrence so returning to it can extend that selection.
      // The foreign boundary must not become this registry's activeRoot, even
      // when its DOM is nested inside one of this editor's registered panels.
      if (activatesPanel) {
        if (this.activeRoot) {
          this.panels.get(this.activeRoot)?.deactivate?.();
        }
      }
      return;
    }
    const candidate = boundary && this.panels.has(boundary) ? boundary : undefined;
    let chosen = this.activeRoot;
    if (this.eventPanels.has(raw)) {
      chosen = this.eventPanels.get(raw) ?? null;
    } else {
      if (pointerContinuation && this.pointerRoot && this.panels.has(this.pointerRoot)) {
        chosen = this.pointerRoot;
      } else if (candidate) {
        chosen = candidate;
      }
      this.eventPanels.set(raw, chosen);
      if (raw.type === "pointerdown" && chosen) {
        this.pointerRoot = chosen;
        pointerRoots.set(chosen.ownerDocument, chosen);
      }
      if (raw.type === "pointerup" || raw.type === "pointercancel") {
        this.pointerRoot = undefined;
        pointerRoots.delete(fallback.ownerDocument);
      }
    }
    const root = chosen ?? fallback;
    if (attachedRoot && attachedRoot !== root) {
      return;
    }
    const changed = chosen !== this.activeRoot;
    // Hover belongs to the pointed panel's handlers without taking editing focus
    // or clearing the selection in the panel where the user is working.
    if (changed && activatesPanel) {
      if (this.activeRoot) {
        this.panels.get(this.activeRoot)?.deactivate?.();
        this.selection.clear();
      }
      this.activeRoot = chosen;
    }
    return root;
  }

  /** Cancels mounted panels' DOM work before shared extension cleanup begins. */
  cancelPendingSelections(): void {
    const errors: unknown[] = [];
    for (const { cancelSelection } of this.panels.values()) {
      try {
        cancelSelection?.();
      } catch (error) {
        errors.push(error);
      }
    }
    if (errors.length === 1) {
      throw errors[0];
    }
    if (errors.length) {
      throw new AggregateError(errors, "View selection cleanup failed");
    }
  }

  /** Releases mounted roots and pointer ownership during runtime teardown. */
  destroy(): void {
    this.activeRoot = null;
    this.panels.clear();
    this.rootListeners.clear();
    if (this.pointerRoot && pointerRoots.get(this.pointerRoot.ownerDocument) === this.pointerRoot) {
      pointerRoots.delete(this.pointerRoot.ownerDocument);
    }
    this.pointerRoot = undefined;
  }
  /**
   * Notifies subscribers that the set of mounted panel roots changed.
   */
  private notifyRootsChanged(): void {
    this.rootListeners.forEach((listener) => listener());
  }
}
