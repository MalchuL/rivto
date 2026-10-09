import type { DocumentModel } from "@chulane/document-model";
import type { EditorMode } from "@chulane/rivto";
import type { EditorViewApi } from "../../types";
import type { EditorRuntime } from "../../editor-runtime";
import { DOCUMENT_VIEW_SELECTOR } from "./document-view";

// Window pointer continuations belong to the editor that started the gesture,
// including when the pointer crosses another editor's view on the same page.
const pointerRoots = new WeakMap<Document, HTMLElement>();
const pointerEventRoots = new WeakMap<Event, HTMLElement>();

/** Owns mounted document roots, focus, and event routing between their views. */
export class DocumentViewRegistry {
  private activeView: HTMLElement | null = null;
  private pointerView?: HTMLElement;
  private readonly eventViews = new WeakMap<globalThis.Event, HTMLElement | null>();
  private readonly documentViews = new Map<HTMLElement, { document: DocumentModel; rootBlockId?: string; api?: EditorViewApi; deactivate?: () => void }>();

  /**
   * @param editorRuntime - Document editor whose selection follows the active view.
   * @param rootsChanged - Reconnects delegated listeners after roots change.
   */
  constructor(private readonly editorRuntime: EditorRuntime, private readonly rootsChanged: () => void) {}

  /** @returns All mounted roots, including each full-document and subtree occurrence. */
  getRoots(): ReadonlySet<HTMLElement> {
    return new Set(this.documentViews.keys());
  }

  /** @returns Whether mounted document views need focus and pointer lifecycle listeners. */
  get hasDocumentViews(): boolean { return this.documentViews.size > 0; }

  /** @param root - Mounted occurrence. @returns Its bound API, when supplied. */
  getApi(root: HTMLElement): EditorViewApi | undefined { return this.documentViews.get(root)?.api; }

  /** @returns The focused view occurrence, or a mounted full-document surface before interaction; falls back to the first subtree when no full document is mounted. */
  getRoot(): HTMLElement | null {
    if (this.activeView) return this.activeView;
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
   * their own view root; the shared manager uses the active
   * root. No additional mode state is stored, and the core mode remains shared.
   * Dispatch captures this value once in `event.mode`; handlers use that snapshot.
   * View-specific commands outside dispatch can call this method, while operations
   * that depend on document mode should use `editorRuntime.mode.get()`.
   * @returns Current DOM occurrence's surface kind, or core mode before mounting
   * or when the root has no recognized surface type.
   */
  getSurfaceType(root = this.getRoot()): EditorMode {
    const surface = root?.getAttribute("data-rivto-surface");
    if (surface === "block" || surface === "edgeless") return surface;
    return this.editorRuntime.mode.get();
  }

  /**
   * Reads the API belonging to the current DOM occurrence without retaining a document.
   * @returns Mounted view's document-bound API, or undefined when no registered view supplies one.
   */
  getDocumentView(): EditorViewApi | undefined {
    const root = this.getRoot();
    return root ? this.documentViews.get(root)?.api : undefined;
  }

  /**
   * Registers one document occurrence and connects shared delegated listeners to its root.
   * @param root - Mounted surface displaying the full document or source subtree.
   * @param document - Source model used for commands within this region.
   * @param rootBlockId - Displayed source root bounding selection and navigation.
   * @param api - View-bound API supplied to handlers; omitted only for a region that must not dispatch editing handlers.
   * @param deactivate - Closes this view's transient UI when it loses focus or is removed.
   * @returns Idempotent cleanup that clears selection when a focused subtree is removed
   * and returns keyboard focus to an enclosing mounted surface, retaining source undo.
   * Full-document surface changes preserve selection when switching presentation modes.
   */
  registerDocumentView(root: HTMLElement, document: DocumentModel, rootBlockId?: string, api?: EditorViewApi, deactivate?: () => void): () => void {
    const entry = { document, rootBlockId, api, deactivate };
    this.documentViews.set(root, entry);
    this.rootsChanged();
    return () => {
      if (this.documentViews.get(root) !== entry) return;
      this.documentViews.delete(root);
      entry.api?.selection.cancelPendingSelectionCallback(root);
      if (this.pointerView === root) {
        this.pointerView = undefined;
        if (pointerRoots.get(root.ownerDocument) === root) pointerRoots.delete(root.ownerDocument);
      }
      this.rootsChanged();
      deactivate?.();
      if (this.activeView !== root) return;
      this.activeView = null;
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
    const fallback = this.getRoot();
    if (!fallback) return;
    const selectionNode = raw.type === "selectionchange" ? fallback.ownerDocument.getSelection()?.anchorNode : undefined;
    const target = selectionNode ?? raw.target;
    const ElementConstructor = fallback.ownerDocument.defaultView!.Element;
    const element = target instanceof ElementConstructor ? target : (target as Node | null)?.parentElement;
    const boundary = element?.closest<HTMLElement>(DOCUMENT_VIEW_SELECTOR);
    const activatesView = raw.type === "focusin" || raw.type === "pointerdown" || raw.type === "input" || raw.type === "keydown";
    const pointerContinuation = raw.type === "pointermove" || raw.type === "pointerup" || raw.type === "pointercancel";
    const pointerRoot = pointerEventRoots.get(raw) ?? pointerRoots.get(fallback.ownerDocument);
    if (pointerContinuation && pointerRoot) {
      pointerEventRoots.set(raw, pointerRoot);
      if (!this.documentViews.has(pointerRoot)) return;
    }
    // A nested editor owns its nearest view even when this runtime uses capture listeners.
    if (boundary && !this.documentViews.has(boundary) && !this.pointerView) {
      // Another editor can take focus without discarding this editor's selection.
      // Keep the last occurrence so returning to it can extend that selection.
      if (activatesView) {
        if (this.activeView) this.documentViews.get(this.activeView)?.deactivate?.();
      }
      return;
    }
    const candidate = boundary && this.documentViews.has(boundary) ? boundary : undefined;
    let chosen = this.activeView;
    if (this.eventViews.has(raw)) chosen = this.eventViews.get(raw) ?? null;
    else {
      if (pointerContinuation && this.pointerView && this.documentViews.has(this.pointerView)) chosen = this.pointerView;
      else if (candidate) chosen = candidate;
      this.eventViews.set(raw, chosen);
      if (raw.type === "pointerdown" && chosen) {
        this.pointerView = chosen;
        pointerRoots.set(chosen.ownerDocument, chosen);
      }
      if (raw.type === "pointerup" || raw.type === "pointercancel") {
        this.pointerView = undefined;
        pointerRoots.delete(fallback.ownerDocument);
      }
    }
    const root = chosen ?? fallback;
    if (attachedRoot && attachedRoot !== root) return;
    const changed = chosen !== this.activeView;
    // Hover belongs to the pointed view's handlers without taking editing focus
    // or clearing the selection in the view where the user is working.
    if (changed && activatesView) {
      if (this.activeView) {
        this.documentViews.get(this.activeView)?.deactivate?.();
        this.editorRuntime.selection.clear();
      }
      this.activeView = chosen;
    }
    return root;
  }

  /** Cancels mounted views' DOM work before shared extension cleanup begins. */
  cancelPendingSelections(): void {
    const errors: unknown[] = [];
    for (const { api } of this.documentViews.values()) {
      try { api?.selection.destroy(); } catch (error) { errors.push(error); }
    }
    if (errors.length === 1) throw errors[0];
    if (errors.length) throw new AggregateError(errors, "View selection cleanup failed");
  }

  /** Releases mounted roots and pointer ownership during runtime teardown. */
  destroy(): void {
    this.activeView = null;
    this.documentViews.clear();
    if (this.pointerView && pointerRoots.get(this.pointerView.ownerDocument) === this.pointerView) {
      pointerRoots.delete(this.pointerView.ownerDocument);
    }
    this.pointerView = undefined;
  }
}
