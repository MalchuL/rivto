import { DOMEventListeners, type NativeListenerGroup } from "./dom-event-listeners";
/**
 * Browser event registration and dispatch. Event payloads identify the receiving
 * view and its selection; document mutations still go through core managers.
 */
import type { EditorMode } from "@chulane/rivto";
import {
  BLOCK_CONTENT_SELECTOR,
  BLOCK_ID_ATTRIBUTE,
  BLOCK_ID_SELECTOR,
} from "../../constants";
import type { EditorRuntime } from "../../editor/editor-runtime";
import type { DocumentViewScope } from "./document-view";
import type {
  DOMEventDefinition,
  DOMEventName,
  DOMEventScope,
  DOMEventTarget,
} from "./dom-types";
import { EditorEvent } from "./editor-event";
import type { EditorViewRegistry } from "./editor-view-registry";
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

/**
 * Registers and dispatches browser events for all views of one document.
 *
 * DOMEventListeners attaches the native listeners. EditorViewRegistry chooses the
 * receiving view; this manager creates its EditorEvent and runs matching handlers
 * in registration order. A handled event is not offered to later registrations.
 * KeyboardManager defines keyboard actions and registers its keydown and keyup
 * handlers here, on the editor surface or window.
 */
export class EventManager {
  private readonly registrations: DOMRegistration[] = [];
  private readonly registrationIds = new Set<string>();
  private readonly registrationDisposers = new Map<string, () => void>();
  private readonly listeners = new DOMEventListeners((group, event, root) => this.dispatch(group, event, root));
  private readonly unsubscribeRoots: () => void;
  private readonly claimedEvents = new WeakSet<globalThis.Event>();
  private readonly editorViews: EditorViewRegistry;
  private destroyed = false;

  /**
   * Creates the browser-event runtime before extensions are installed.
   *
   * @param editorRuntime - Owning React runtime for payloads and registration lifecycle.
   */
  constructor(private readonly editorRuntime: EditorRuntime) {
    this.editorViews = editorRuntime.editorViews;
    this.unsubscribeRoots = this.editorViews.subscribeRoots(() => this.reconnectListeners());
  }


  /**
   * Registers a typed delegated DOM event.
   *
   * @param definition - Stable ID, native event type, target, and optional filters.
   * The target defaults to the surface; capture and passive default to false.
   * @param listener - Handler returning true when it handled the event. This stops
   * later editor handlers and prevents the browser default when cancellation is allowed.
   * DOM propagation is not stopped. Passive listeners cannot cancel browser defaults.
   * @param owner - Optional view restricting dispatch to its root and prefixing the ID.
   * The caller must also retain the disposer for view cleanup.
   * @returns Idempotent disposer, also owned by the registering extension.
   * @throws If the ID is empty, already registered in its scope, or the runtime is destroyed.
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

    const registration = { ...this.createRegistration({ ...definition, id }, listener), owner };
    this.registrationIds.add(id);
    this.registrations.push(registration);
    this.reconnectListeners();

    let active = true;
    let dispose: () => void = () => undefined;
    dispose = this.editorRuntime.extensions.own(() => {
      if (!active) return;
      active = false;
      const index = this.registrations.indexOf(registration);
      if (index >= 0) this.registrations.splice(index, 1);
      this.registrationIds.delete(id);
      if (this.registrationDisposers.get(id) === dispose) {
        this.registrationDisposers.delete(id);
      }
      this.reconnectListeners();
    });
    this.registrationDisposers.set(id, dispose);
    return dispose;
  }

  /**
   * Deletes one DOM registration by its stable ID.
   *
   * @param id - Registered ID, including the view prefix for a view-owned registration.
   * @returns True when a registration existed and was disposed.
   */
  delete(id: string): boolean {
    const dispose = this.registrationDisposers.get(id);
    if (!dispose) return false;
    dispose();
    return true;
  }

  /** Disconnects native listeners and root notifications, then disposes registrations
   * in reverse order. Repeated calls do nothing. */
  destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    this.listeners.disconnect();
    this.unsubscribeRoots();
    [...this.registrationDisposers.values()].reverse().forEach((dispose) => dispose());
    this.registrationDisposers.clear();
    this.registrationIds.clear();
    this.registrations.length = 0;
  }

  /** Throws when a registration is attempted after runtime destruction. */
  assertActive(): void {
    if (this.destroyed) throw new Error("Editor event runtime is destroyed");
    this.editorRuntime.extensions.assertActive();
  }

  private createRegistration(
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

  private reconnectListeners(): void {
    if (this.destroyed) this.listeners.disconnect();
    else this.listeners.connect(this.registrations, this.editorViews.getRoots());
  }

  /**
   * Runs matching registrations for one native event until one claims it.
   *
   * @param group - Capture/passive/target identity of the native listener.
   * @param raw - Browser event dispatched to that listener.
   * @param attachedRoot - Surface listener root; omitted for document/window listeners.
   * @returns Nothing.
   */
  private dispatch(group: NativeListenerGroup, raw: globalThis.Event, attachedRoot?: HTMLElement): void {
    if (raw.defaultPrevented || this.claimedEvents.has(raw)) return;
    const root = this.editorViews.resolveEventRoot(raw, attachedRoot);
    if (root) this.dispatchRegistrations(group, raw, root);
  }

  private dispatchRegistrations(group: NativeListenerGroup, raw: globalThis.Event, root: HTMLElement): void {
    const event = this.createEditorEvent(group.target, raw, root);
    if (!event) return;
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
        this.markHandled(raw);
        return;
      }
    }
  }

  private createEditorEvent(
    eventTarget: DOMEventTarget,
    raw: globalThis.Event,
    root: HTMLElement,
  ): AnyEditorEvent | undefined {
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
    const editorView = this.editorViews.getApi(root);
    if (!editorView) return;
    return new EditorEvent({
      raw: raw as never,
      editorView,
      root,
      // Route handlers by the receiving surface: core mode may be edgeless
      // while this event belongs to a page embedding of the same document.
      mode: this.editorViews.getSurfaceType(root),
      selection: editorView.selection.get(),
      eventTarget,
      insideRoot,
      blockElement,
      blockId: blockElement?.getAttribute(BLOCK_ID_ATTRIBUTE) ?? undefined,
      contentElement,
    });
  }

  private markHandled(raw: globalThis.Event): void {
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
