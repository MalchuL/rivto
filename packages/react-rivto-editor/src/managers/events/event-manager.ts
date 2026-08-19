import type { EditorMode } from "@chulane/rivto";
import type { EventsCapability } from "../../capabilities";
import type { ReactEditorImpl } from "../../react-editor";
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
  private destroyed = false;

  /**
   * Creates the browser-event runtime before extensions are installed.
   *
   * @param reactEditor - Complete owning React runtime.
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
  ): () => void;

  register(
    definition: DOMEventDefinition,
    listener: EditorEventHandler<AnyEditorEvent>,
  ): () => void {
    this.assertActive();
    const id = definition.id.trim();
    if (!id) throw new Error("Event registration ID is required");
    if (this.registrationIds.has(id)) {
      throw new Error(`Event registration ${id} is already registered`);
    }

    const registration = this.createDOMRegistration({ ...definition, id }, listener);
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
    this.root = root;
    this.reconnect();
  }

  /** @returns The currently mounted surface root, if React committed one. */
  getRoot(): HTMLElement | null {
    return this.root;
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
    if (!this.root) return;
    const groups = new Map<string, NativeListenerGroup>();
    for (const registration of this.registrations) {
      const group: NativeListenerGroup = registration;
      const key = [group.target, group.type, group.capture, group.passive].join(":");
      if (!groups.has(key)) groups.set(key, group);
    }
    for (const group of groups.values()) {
      const nativeTarget = this.nativeTarget(group.target);
      if (!nativeTarget) continue;
      const listener: EventListener = (event) => this.dispatch(group, event);
      nativeTarget.addEventListener(group.type, listener, {
        capture: group.capture,
        passive: group.passive,
      });
      this.connected.push({ ...group, nativeTarget, listener });
    }
  }

  private disconnect(): void {
    for (const { nativeTarget, type, listener, capture } of this.connected) {
      nativeTarget.removeEventListener(type, listener, capture);
    }
    this.connected.length = 0;
  }

  private nativeTarget(target: DOMEventTarget): EventTarget | null {
    if (!this.root) return null;
    if (target === "document") return this.root.ownerDocument;
    if (target === "window") return this.root.ownerDocument.defaultView;
    return this.root;
  }

  /**
   * Runs matching registrations for one native event until one claims it.
   *
   * @param group - Capture/passive/target identity of the native listener.
   * @param raw - Browser event dispatched to that listener.
   * @returns Nothing.
   */
  private dispatch(group: NativeListenerGroup, raw: globalThis.Event): void {
    const root = this.root;
    if (!root || raw.defaultPrevented || this.claimedEvents.has(raw)) return;

    const event = this.createEditorEvent(group.target, raw, root);
    // Iterate in place: pointermove fires hundreds of times per gesture and
    // these handlers do not splice `registrations` while dispatch is running.
    for (const registration of this.registrations) {
      if (raw.defaultPrevented || this.claimedEvents.has(raw)) return;
      if (
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
    const editor = this.reactEditor.editor;
    return new EditorEvent({
      raw: raw as never,
      editor,
      root,
      mode: editor.mode.get(),
      selection: editor.selection.get(),
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
