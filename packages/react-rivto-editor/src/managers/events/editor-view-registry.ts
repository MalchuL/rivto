import type { DocumentModel } from "@chulane/document-model";
import type { EditorMode } from "@chulane/rivto";
import type { EditorViewApi } from "../../editor-view/types";
import type { EditorRuntime } from "../../editor/editor-runtime";
import { DOCUMENT_VIEW_SELECTOR } from "./document-view";

// Window pointer continuations belong to the editor that started the gesture,
// including when the pointer crosses another editor's view on the same page.
const pointerRoots = new WeakMap<Document, HTMLElement>();
const pointerEventRoots = new WeakMap<Event, HTMLElement>();

/** Owns mounted document roots, focus, and event routing between their views. */
export class EditorViewRegistry {
  private activeRoot: HTMLElement | null = null;
  private pointerRoot?: HTMLElement;
  private readonly eventViews = new WeakMap<globalThis.Event, HTMLElement | null>();
  private readonly documentViews = new Map<HTMLElement, { document: DocumentModel; rootBlockId?: string; api?: EditorViewApi; deactivate?: () => void; cancelSelection?: () => void }>();

  /**
   * @param editorRuntime - Document editor whose selection follows the active view.
   * Root subscribers reconnect delegated listeners after roots change.
   */
  constructor(private readonly editorRuntime: EditorRuntime) {}
  private readonly rootListeners = new Set<() => void>();
  /** Observes root registration changes without observing document edits. */
  subscribeRoots(listener: () => void): () => void {
    this.rootListeners.add(listener);
    return () => { this.rootListeners.delete(listener); };
  }
  private notifyRootsChanged(): void { this.rootListeners.forEach((listener) => listener()); }
  /** Returns the API for the last activated registered view. The view remains remembered
   * when focus leaves the editor. Returns undefined before activation, after its root
   * is removed, or when that root was registered without an API. */
  getActive(): EditorViewApi | undefined { return this.activeRoot ? this.getApi(this.activeRoot) : undefined; }
  /** Returns the first registered full-document view, falling back to the first subtree.
   * Returns undefined when no root is registered or the chosen root has no API.
   * This choice does not depend on which view is active. */
  getDefault(): EditorViewApi | undefined { const root = this.getDefaultRoot(); return root ? this.getApi(root) : undefined; }
  /** Returns the last activated registered root without applying a fallback, or null
   * before activation and after that root is removed. */
  getActiveRoot(): HTMLElement | null { return this.activeRoot; }


  /** @returns A new set of all registered roots, including full-document and subtree views.
   * Later registrations and removals do not change the returned set. */
  getRoots(): ReadonlySet<HTMLElement> {
    return new Set(this.documentViews.keys());
  }

  /** @returns Whether mounted document views need focus and pointer lifecycle listeners. */
  get hasDocumentViews(): boolean { return this.documentViews.size > 0; }

  /** @param root - Registered editor surface.
   * @returns Its API, or undefined for an unknown root or a registration without an API. */
  getApi(root: HTMLElement): EditorViewApi | undefined { return this.documentViews.get(root)?.api; }

  /** @returns A mounted full-document surface, independent of interaction; falls back to the first subtree when no full document is mounted. */
  getDefaultRoot(): HTMLElement | null {
    // Child refs mount first. Prefer the full document over an embedding until
    // an interaction explicitly activates one of its subtree occurrences.
    for (const [root, view] of this.documentViews) {
      if (view.rootBlockId === undefined) return root;
    }
    return this.documentViews.keys().next().value ?? null;
  }

  /**
   * Reads the current view's rendered surface without changing the core mode.
   *
   * The core mode manager belongs to the document and chooses its main presentation.
   * This method reads the receiving DOM occurrence instead: a page embedding
   * returns `block` even inside an `edgeless` document. Scoped event managers use
   * their own view root; a call without a root uses the active root,
   * falling back to the first full-document view or first subtree. No additional mode state is stored, and the core mode remains shared.
   * Dispatch captures this value once in `event.mode`; handlers use that snapshot.
   * View-specific commands outside dispatch can call this method, while operations
   * that depend on document mode should use `editorRuntime.mode.get()`.
   * @param root - Surface to inspect; omitted to choose the active or default root.
   * Explicit null reads the core mode without choosing another root.
   * @returns Current DOM view's surface kind, or core mode before mounting
   * or when the root has no recognized surface type.
   */
  getSurfaceType(root = this.getActiveRoot() ?? this.getDefaultRoot()): EditorMode {
    const surface = root?.getAttribute("data-rivto-surface");
    if (surface === "block" || surface === "edgeless") return surface;
    return this.editorRuntime.mode.get();
  }

  /**
   * Registers one document occurrence and connects shared delegated listeners to its root.
   * @param root - Mounted surface displaying the full document or source subtree.
   * @param document - Source model used for commands within this region.
   * @param rootBlockId - Displayed source root bounding selection and navigation.
   * @param api - View-bound API supplied to handlers; omitted only for a region that must not dispatch editing handlers.
   * @param cancelSelection - Cancels pending DOM selection work before removing the root.
   * @param deactivate - Closes this view's transient UI when it loses focus or is removed.
   * @returns Idempotent cleanup that clears selection when a focused subtree is removed
   * and returns keyboard focus to an enclosing mounted surface, retaining source undo.
   * Full-document surface changes preserve selection when switching presentation modes.
   */
  registerDocumentView(root: HTMLElement, document: DocumentModel, rootBlockId?: string, api?: EditorViewApi, deactivate?: () => void, cancelSelection?: () => void): () => void {
    this.editorRuntime.extensions.assertActive();
    const entry = { document, rootBlockId, api, deactivate, cancelSelection };
    this.documentViews.set(root, entry);
    this.notifyRootsChanged();
    return () => {
      if (this.documentViews.get(root) !== entry) return;
      this.documentViews.delete(root);
      entry.cancelSelection?.();
      if (this.pointerRoot === root) {
        this.pointerRoot = undefined;
        if (pointerRoots.get(root.ownerDocument) === root) pointerRoots.delete(root.ownerDocument);
      }
      this.notifyRootsChanged();
      deactivate?.();
      if (this.activeRoot !== root) return;
      this.activeRoot = null;
      // Retain source undo while the target is missing; the next view interaction chooses its own history again.
      // Replacing a full-document surface (page/canvas) keeps core selection.
      // Removing the active embedded subtree releases its occurrence's selection.
      if (entry.rootBlockId !== undefined) this.editorRuntime.selection.clear();
      if (root.contains(root.ownerDocument.activeElement)) {
        const parent = root.parentElement?.closest<HTMLElement>(DOCUMENT_VIEW_SELECTOR);
        if (parent && this.documentViews.has(parent)) parent.focus({ preventScroll: true });
      }
    };
  }

  /**
   * Chooses the receiving view, retaining the origin of a continuing pointer gesture.
   * Hover routes without changing editing focus. Focus, input, and keyboard events
   * activate their view and deactivate the previous occurrence's transient UI.
   * @param raw - Native event, shared between listener groups.
   * @param attachedRoot - Surface listener's root; omitted for document/window listeners.
   * @returns Receiving root, or undefined when another editor or surface owns the event.
   */
  resolveEventRoot(raw: Event, attachedRoot?: HTMLElement): HTMLElement | undefined {
    const fallback = this.getActiveRoot() ?? this.getDefaultRoot();
    if (!fallback) return;
    const selectionNode = raw.type === "selectionchange" ? fallback.ownerDocument.getSelection()?.anchorNode : undefined;
    const target = selectionNode ?? raw.target;
    const ElementConstructor = fallback.ownerDocument.defaultView!.Element;
    const element = target instanceof ElementConstructor ? target : (target as Node | null)?.parentElement;
    const boundary = element?.closest<HTMLElement>(DOCUMENT_VIEW_SELECTOR);
    const activatesView = raw.type === "focusin" || raw.type === "pointerdown" || raw.type === "input" || raw.type === "keydown";
    const pointerContinuation = raw.type === "pointermove" || raw.type === "pointerup" || raw.type === "pointercancel";
    const gestureRoot = pointerEventRoots.get(raw) ?? pointerRoots.get(fallback.ownerDocument);
    if (pointerContinuation && gestureRoot) {
      pointerEventRoots.set(raw, gestureRoot);
      if (!this.documentViews.has(gestureRoot)) return;
    }
    // A nested editor owns its nearest view even when this runtime uses capture listeners.
    if (boundary && !this.documentViews.has(boundary) && !this.pointerRoot) {
      // Another editor can take focus without discarding this editor's selection.
      // Keep the last occurrence so returning to it can extend that selection.
      if (activatesView) {
        if (this.activeRoot) this.documentViews.get(this.activeRoot)?.deactivate?.();
      }
      return;
    }
    const candidate = boundary && this.documentViews.has(boundary) ? boundary : undefined;
    let chosen = this.activeRoot;
    if (this.eventViews.has(raw)) chosen = this.eventViews.get(raw) ?? null;
    else {
      if (pointerContinuation && this.pointerRoot && this.documentViews.has(this.pointerRoot)) chosen = this.pointerRoot;
      else if (candidate) chosen = candidate;
      this.eventViews.set(raw, chosen);
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
    if (attachedRoot && attachedRoot !== root) return;
    const changed = chosen !== this.activeRoot;
    // Hover belongs to the pointed view's handlers without taking editing focus
    // or clearing the selection in the view where the user is working.
    if (changed && activatesView) {
      if (this.activeRoot) {
        this.documentViews.get(this.activeRoot)?.deactivate?.();
        this.editorRuntime.selection.clear();
      }
      this.activeRoot = chosen;
    }
    return root;
  }

  /** Cancels mounted views' DOM work before shared extension cleanup begins. */
  cancelPendingSelections(): void {
    const errors: unknown[] = [];
    for (const { cancelSelection } of this.documentViews.values()) {
      try { cancelSelection?.(); } catch (error) { errors.push(error); }
    }
    if (errors.length === 1) throw errors[0];
    if (errors.length) throw new AggregateError(errors, "View selection cleanup failed");
  }

  /** Releases mounted roots and pointer ownership during runtime teardown. */
  destroy(): void {
    this.activeRoot = null;
    this.documentViews.clear();
    this.rootListeners.clear();
    if (this.pointerRoot && pointerRoots.get(this.pointerRoot.ownerDocument) === this.pointerRoot) {
      pointerRoots.delete(this.pointerRoot.ownerDocument);
    }
    this.pointerRoot = undefined;
  }
}
