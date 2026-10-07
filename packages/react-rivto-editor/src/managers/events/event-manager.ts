/**
 * Editor interaction contracts and operations. Browser editing context is separate from core whole-block selection; document mutations use core managers.
 */
import { DOCUMENT_VIEW_SELECTOR, type DocumentViewScope } from "./document-view";
import type { DocumentModel } from "@chulane/document-model";
import type { EditorMode } from "@chulane/rivto";
import type { EventsCapability } from "../../capabilities";
import type { ReactEditor } from "../../types";
import type { ReactEditorImpl } from "../../react-editor";
import type { ReactSelectionManager } from "../selection/selection-manager";
import {
  BLOCK_CONTENT_SELECTOR,
  BLOCK_ID_ATTRIBUTE,
  BLOCK_ID_SELECTOR,
} from "../../constants";
import type {
  DOMEventDefinition,
  DOMEventName,
  DOMEventScope,
  DOMEventTarget,
} from "./dom-types";
import { EditorEvent } from "./editor-event";
import type { EditorEventHandler } from "./types";

type AnyEditorEvent = EditorEvent<DOMEventTarget, never>;

interface DOMRegistration {
  readonly id: string;
  readonly owner?: DocumentViewScope;
  readonly type: string;
  readonly target: DOMEventTarget;
  readonly scope?: DOMEventScope;
  readonly listener: EditorEventHandler<AnyEditorEvent>;
  readonly mode?: EditorMode | readonly EditorMode[];
  readonly capture: boolean;
  readonly passive: boolean;
  readonly when?: (event: AnyEditorEvent) => boolean;
}

interface NativeListenerGroup {
  readonly target: DOMEventTarget;
  readonly type: string;
  readonly capture: boolean;
  readonly passive: boolean;
}

interface ConnectedListener extends NativeListenerGroup {
  readonly nativeTarget: EventTarget;
  readonly listener: EventListener;
}

// Window pointer continuations belong to the editor that started the gesture,
// including when the pointer crosses another editor's view on the same page.
const pointerRoots = new WeakMap<Document, HTMLElement>();
const pointerEventRoots = new WeakMap<Event, HTMLElement>();

/**
 * Owns every delegated native browser event for one React editor.
 *
 * Semantic keyboard actions belong to KeyboardManager, which uses this manager
 * for surface/window keydown and keyup transport.
 */
export class EventManager implements EventsCapability {
  private readonly registrations: DOMRegistration[] = [];
  private readonly registrationIds = new Set<string>();
  private readonly registrationDisposers = new Map<string, () => void>();
  private readonly connected: ConnectedListener[] = [];
  private readonly claimedEvents = new WeakSet<globalThis.Event>();
  private root: HTMLElement | null = null;
  private activeView: HTMLElement | null = null;
  private operationRoot?: HTMLElement | null;
  private pointerView?: HTMLElement;
  private readonly eventViews = new WeakMap<globalThis.Event, HTMLElement | null>();
  private readonly documentViews = new Map<HTMLElement, { document: DocumentModel; rootBlockId?: string; api?: ReactEditor; deactivate?: () => void }>();
  private destroyed = false;

  /**
   * Creates the browser-event runtime before extensions are installed.
   *
   * @param reactEditor - Owning React runtime for payloads and registration lifecycle.
   */
  constructor(private readonly reactEditor: ReactEditorImpl) {}

  /**
   * Registers a typed delegated DOM event.
   *
   * @param definition - Native event, attachment realm, scope, and stable ID.
   * @param listener - Handler returning true only when it handled the event.
   * @returns Idempotent disposer for this registration.
   */
  register<
    Target extends DOMEventTarget = "surface",
    Type extends DOMEventName<Target> = DOMEventName<Target>,
  >(
    definition: DOMEventDefinition<Target, Type>,
    listener: EditorEventHandler<EditorEvent<Target, Type>>,
    owner?: DocumentViewScope,
  ): () => void;

  register(
    definition: DOMEventDefinition,
    listener: EditorEventHandler<AnyEditorEvent>,
    owner?: DocumentViewScope,
  ): () => void {
    this.assertActive();
    const id = owner ? `${owner.id}:${definition.id.trim()}` : definition.id.trim();
    if (!definition.id.trim()) throw new Error("Event registration ID is required");
    if (this.registrationIds.has(id)) {
      throw new Error(`Event registration ${id} is already registered`);
    }

    const registration = { ...this.createDOMRegistration({ ...definition, id }, listener), owner };
    this.registrationIds.add(id);
    this.registrations.push(registration);
    this.reconnect();

    let active = true;
    let dispose: () => void = () => undefined;
    dispose = this.reactEditor.extensions.own(() => {
      if (!active) return;
      active = false;
      const index = this.registrations.indexOf(registration);
      if (index >= 0) this.registrations.splice(index, 1);
      this.registrationIds.delete(id);
      if (this.registrationDisposers.get(id) === dispose) {
        this.registrationDisposers.delete(id);
      }
      this.reconnect();
    });
    this.registrationDisposers.set(id, dispose);
    return dispose;
  }

  /**
   * Deletes one DOM registration by its stable ID.
   *
   * @param id - Identity supplied to register().
   * @returns True when a registration existed and was disposed.
   */
  delete(id: string): boolean {
    const dispose = this.registrationDisposers.get(id);
    if (!dispose) return false;
    dispose();
    return true;
  }

  /**
   * Replaces the mounted surface root used by delegated listeners.
   *
   * The previous surface, document, and window listeners are detached before
   * registrations reconnect to the new surface's browser realm.
   *
   * @param root - Mounted surface root element, or null during unmount.
   */
  setRoot(root: HTMLElement | null): void {
    if (this.destroyed && root === null) {
      this.root = null;
      return;
    }
    this.assertActive();
    if (root === this.root) return;
    if (this.root) (this.reactEditor.selection as ReactSelectionManager).cancelPendingSelectionCallback(this.root);
    this.root = root;
    this.activeView = null;
    this.reconnect();
  }

  /** @returns The focused view occurrence, or a mounted full-document surface before interaction; falls back to the first subtree when no full document is mounted. */
  getRoot(): HTMLElement | null {
    if (this.operationRoot !== undefined) return this.operationRoot;
    if (this.activeView || this.root) return this.activeView ?? this.root;
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
   * their own view root; the shared manager uses the active or synchronous operation
   * root. No additional mode state is stored, and the core mode remains shared.
   * Dispatch captures this value once in `event.mode`; handlers use that snapshot.
   * View-specific commands outside dispatch can call this method, while operations
   * that depend on document mode should use `reactEditor.mode.get()`.
   * @returns Current DOM occurrence's surface kind, or core mode before mounting
   * or when the root has no recognized surface type.
   */
  getSurfaceType(): EditorMode {
    const surface = this.getRoot()?.getAttribute("data-rivto-surface");
    if (surface === "block" || surface === "edgeless") return surface;
    return this.reactEditor.mode.get();
  }

  /**
   * Reads the API belonging to the current DOM occurrence without retaining a document.
   * @returns Mounted view's document-bound API, or undefined when no registered view supplies one.
   */
  getDocumentView(): ReactEditor | undefined {
    const root = this.getRoot();
    return root ? this.documentViews.get(root)?.api : undefined;
  }

  /**
   * Registers one document occurrence and connects shared delegated listeners to its root.
   * @param root - Mounted surface displaying the full document or source subtree.
   * @param document - Source model used for commands within this region.
   * @param rootBlockId - Displayed source root bounding selection and navigation.
   * @param api - View-bound API supplied to handlers; omitted to use the host API.
   * @param deactivate - Closes this view's transient UI when it loses focus or is removed.
   * @returns Idempotent cleanup that clears selection when a focused subtree is removed
   * and returns keyboard focus to an enclosing mounted surface, retaining source undo.
   * Full-document surface changes preserve selection when switching presentation modes.
   */
  registerDocumentView(root: HTMLElement, document: DocumentModel, rootBlockId?: string, api?: ReactEditor, deactivate?: () => void): () => void {
    this.assertActive();
    const entry = { document, rootBlockId, api, deactivate };
    this.documentViews.set(root, entry);
    this.reconnect();
    return () => {
      if (this.documentViews.get(root) !== entry) return;
      this.documentViews.delete(root);
      (this.reactEditor.selection as ReactSelectionManager).cancelPendingSelectionCallback(root);
      if (this.pointerView === root) {
        this.pointerView = undefined;
        if (pointerRoots.get(root.ownerDocument) === root) pointerRoots.delete(root.ownerDocument);
      }
      this.reconnect();
      deactivate?.();
      if (this.activeView !== root) return;
      this.activeView = null;
      // Retain source undo while the target is missing; the next view interaction chooses its own history again.
      // Replacing a full-document surface (page/canvas) keeps core selection.
      // Removing the active embedded subtree releases its occurrence's selection.
      if (entry.rootBlockId !== undefined) this.reactEditor.selection.clear();
      if (root.contains(root.ownerDocument.activeElement)) {
        const parent = root.parentElement?.closest<HTMLElement>(DOCUMENT_VIEW_SELECTOR);
        if (parent && this.documentViews.has(parent)) parent.focus({ preventScroll: true });
        else this.root?.focus({ preventScroll: true });
      }
    };
  }

  /** Enters a view's DOM scope for synchronous operations and restores the previous root. */
  withViewRoot<Result>(root: HTMLElement | null, operation: () => Result): Result {
    const previous = this.operationRoot;
    this.operationRoot = root;
    try { return operation(); }
    finally { this.operationRoot = previous; }
  }

  /**
   * Runs deferred selection or command work in the active DOM occurrence.
   * Explicit view roots take precedence over browser focus; core models never switch.
   * @param operation - Synchronous work to execute.
   * @returns The operation's result after restoring the previous document context.
   */
  runInView<Result>(operation: () => Result): Result {
    return this.withViewRoot(this.getRoot(), operation);
  }

  /** Releases every registration and native listener in reverse order. */
  destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    this.disconnect();
    [...this.registrationDisposers.values()].reverse().forEach((dispose) => dispose());
    this.registrationDisposers.clear();
    this.registrationIds.clear();
    this.registrations.length = 0;
    this.root = null;
    this.activeView = null;
    this.documentViews.clear();
    if (this.pointerView && pointerRoots.get(this.pointerView.ownerDocument) === this.pointerView) {
      pointerRoots.delete(this.pointerView.ownerDocument);
    }
    this.pointerView = undefined;
  }

  /** Throws when a registration is attempted after runtime destruction. */
  assertActive(): void {
    if (this.destroyed) throw new Error("Editor event runtime is destroyed");
    this.reactEditor.extensions.assertActive();
  }

  private createDOMRegistration(
    definition: DOMEventDefinition,
    listener: EditorEventHandler<AnyEditorEvent>,
  ): DOMRegistration {
    return {
      id: definition.id,
      type: definition.type,
      target: definition.target ?? "surface",
      scope: definition.scope,
      listener,
      mode: definition.mode,
      capture: definition.capture ?? false,
      passive: definition.passive ?? false,
      when: definition.when as ((event: AnyEditorEvent) => boolean) | undefined,
    };
  }

  private reconnect(): void {
    this.disconnect();
    if (!this.root && !this.documentViews.size) return;
    const groups = new Map<string, NativeListenerGroup>();
    for (const registration of this.registrations) {
      const group: NativeListenerGroup = registration;
      const key = [group.target, group.type, group.capture, group.passive].join(":");
      if (!groups.has(key)) groups.set(key, group);
    }
    if (this.documentViews.size) {
      // Activation and gesture lifetime belong to views even without interaction extensions.
      const lifecycle: NativeListenerGroup[] = [
        { target: "surface", type: "focusin", capture: false, passive: false },
        { target: "surface", type: "pointerdown", capture: false, passive: false },
        { target: "window", type: "pointerup", capture: false, passive: false },
        { target: "window", type: "pointercancel", capture: false, passive: false },
      ];
      lifecycle.forEach((group) => groups.set([group.target, group.type, group.capture, group.passive].join(":"), group));
    }
    const roots = new Set(this.documentViews.keys());
    if (this.root) roots.add(this.root);
    for (const group of groups.values()) {
      const targets = new Set<EventTarget>();
      for (const root of roots) {
        let nativeTarget: EventTarget | null = root;
        if (group.target === "document") nativeTarget = root.ownerDocument;
        else if (group.target === "window") nativeTarget = root.ownerDocument.defaultView;
        if (!nativeTarget || targets.has(nativeTarget)) continue;
        targets.add(nativeTarget);
        const listener: EventListener = (event) => this.dispatch(group, event, group.target === "surface" ? root : undefined);
        nativeTarget.addEventListener(group.type, listener, { capture: group.capture, passive: group.passive });
        this.connected.push({ ...group, nativeTarget, listener });
      }
    }
  }

  private disconnect(): void {
    for (const { nativeTarget, type, listener, capture } of this.connected) {
      nativeTarget.removeEventListener(type, listener, capture);
    }
    this.connected.length = 0;
  }

  /**
   * Runs matching registrations for one native event until one claims it.
   *
   * @param group - Capture/passive/target identity of the native listener.
   * @param raw - Browser event dispatched to that listener.
   * @returns Nothing.
   */
  private dispatch(group: NativeListenerGroup, raw: globalThis.Event, attachedRoot?: HTMLElement): void {
    const fallback = this.getRoot();
    if (!fallback || raw.defaultPrevented || this.claimedEvents.has(raw)) return;
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
      else if (element && this.root?.contains(element)) chosen = null;
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
    const root = chosen ?? this.root ?? fallback;
    if (attachedRoot && attachedRoot !== root) return;
    const changed = chosen !== this.activeView;
    // Hover belongs to the pointed view's handlers without taking editing focus
    // or clearing the selection in the view where the user is working.
    if (changed && activatesView) {
      if (this.activeView) {
        this.documentViews.get(this.activeView)?.deactivate?.();
        this.reactEditor.selection.clear();
      }
      this.activeView = chosen;
    }
    this.withViewRoot(root, () => this.dispatchRegistrations(group, raw, root));
  }

  private dispatchRegistrations(group: NativeListenerGroup, raw: globalThis.Event, root: HTMLElement): void {
    const event = this.createEditorEvent(group.target, raw, root);
    // Iterate in place: pointermove fires hundreds of times per gesture and
    // these handlers do not splice `registrations` while dispatch is running.
    for (const registration of this.registrations) {
      if (raw.defaultPrevented || this.claimedEvents.has(raw)) return;
      if (
        registration.owner && registration.owner.getRoot() !== root ||
        registration.type !== group.type ||
        registration.target !== group.target ||
        registration.capture !== group.capture ||
        registration.passive !== group.passive ||
        !modeMatches(registration.mode, event.mode) ||
        !scopeMatches(registration.scope, event) ||
        (registration.when && !registration.when(event))
      ) continue;
      if (registration.listener(event)) {
        this.claim(raw);
        return;
      }
    }
  }

  private createEditorEvent(
    eventTarget: DOMEventTarget,
    raw: globalThis.Event,
    root: HTMLElement,
  ): AnyEditorEvent {
    const nativeTarget = raw.target;
    const ElementConstructor = root.ownerDocument.defaultView?.Element;
    const element = ElementConstructor && nativeTarget instanceof ElementConstructor
      ? nativeTarget
      : null;
    const insideRoot = Boolean(
      element && (element === root || root.contains(element)),
    );
    const closestBlock = insideRoot
      ? element?.closest<HTMLElement>(BLOCK_ID_SELECTOR) ?? null
      : null;
    const closestContent = insideRoot
      ? element?.closest<HTMLElement>(BLOCK_CONTENT_SELECTOR) ?? null
      : null;
    const blockElement = closestBlock && root.contains(closestBlock)
      ? closestBlock
      : null;
    const contentElement = closestContent && root.contains(closestContent)
      ? closestContent
      : null;
    const reactEditor = this.documentViews.get(root)?.api ?? this.reactEditor;
    return new EditorEvent({
      raw: raw as never,
      reactEditor,
      root,
      // Route handlers by the receiving surface: core mode may be edgeless
      // while this event belongs to a page embedding of the same document.
      mode: this.getSurfaceType(),
      selection: this.reactEditor.selection.get(),
      eventTarget,
      insideRoot,
      blockElement,
      blockId: blockElement?.getAttribute(BLOCK_ID_ATTRIBUTE) ?? undefined,
      contentElement,
    });
  }

  private claim(raw: globalThis.Event): void {
    if (raw.cancelable) raw.preventDefault();
    this.claimedEvents.add(raw);
  }
}

export const modeMatches = (
  expected: EditorMode | readonly EditorMode[] | undefined,
  actual: EditorMode,
): boolean => !expected ||
  (Array.isArray(expected) ? expected.includes(actual) : expected === actual);

export const scopeMatches = (
  scope: DOMEventScope | undefined,
  event: Pick<
    AnyEditorEvent,
    "insideRoot" | "blockElement" | "contentElement"
  >,
): boolean => {
  if (!scope) return true;
  if (scope === "surface") return event.insideRoot;
  if (scope === "block") return Boolean(event.blockElement);
  return Boolean(event.contentElement);
};
