import type { EditorMode } from "@chulane/rivto";
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
import {
  KeyboardEditorEvent,
} from "./keyboard-editor-event";
import type {
  KeyboardEventDefinition,
  KeyboardEventPhase,
  KeyboardEventTarget,
  KeymapOverrides,
} from "./keyboard-types";
import {
  matchesShortcut,
  parseShortcut,
  shortcutFromKeyboardEvent,
  type ParsedShortcut,
} from "./shortcut";
import { EditorEvent } from "./editor-event";
import type { EditorEventHandler } from "./types";

type AnyEditorEvent = EditorEvent<DOMEventTarget, never>;

interface DOMRegistration {
  readonly kind: "dom";
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

interface KeyboardRegistration {
  readonly kind: "keyboard";
  readonly id: string;
  readonly definition: KeyboardEventDefinition;
  readonly shortcuts: ParsedShortcut[];
  readonly listener: EditorEventHandler<KeyboardEditorEvent>;
}

type EventRegistration = DOMRegistration | KeyboardRegistration;

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
 * Owns every delegated browser event and keyboard action for one React editor.
 *
 * DOM and keyboard definitions share one ordered registry, stable-ID namespace,
 * native-listener transport, lifecycle, and deletion API. Keyboard definitions
 * are merely specialized keydown/keyup registrations: they are dispatched
 * before ordinary DOM handlers, but do not require a second manager.
 */
export class EventManager {
  private readonly registrations: EventRegistration[] = [];
  private readonly registrationIds = new Set<string>();
  private readonly registrationDisposers = new Map<string, () => void>();
  private readonly connected: ConnectedListener[] = [];
  private readonly claimedEvents = new WeakSet<globalThis.Event>();
  private readonly keymap: KeymapOverrides;
  private root: HTMLElement | null = null;
  private destroyed = false;

  /**
   * Creates the sole browser-event runtime before extensions are installed.
   *
   * @param reactEditor - Complete owning React runtime.
   * @param keymap - Creation-time replacements indexed by registration ID.
   */
  constructor(
    private readonly reactEditor: ReactEditorImpl,
    keymap: KeymapOverrides = {},
  ) {
    this.keymap = Object.fromEntries(
      Object.entries(keymap).map(([id, keys]) => [id, [...keys]]),
    );
  }

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

  /**
   * Registers a declarative keyboard action through the same event registry.
   *
   * Keyboard definitions are distinguished by their `keys` property. Keymap
   * overrides are resolved once during registration.
   *
   * @param definition - Shortcuts, restrictions, composition policy, and ID.
   * @param listener - Action returning true only when it handled the shortcut.
   * @returns Idempotent disposer for this registration.
   */
  register(
    definition: KeyboardEventDefinition,
    listener: EditorEventHandler<KeyboardEditorEvent>,
  ): () => void;

  register(
    definition: DOMEventDefinition | KeyboardEventDefinition,
    listener: unknown,
  ): () => void {
    this.assertActive();
    const id = definition.id.trim();
    if (!id) throw new Error("Event registration ID is required");
    if (this.registrationIds.has(id)) {
      throw new Error(`Event registration ${id} is already registered`);
    }

    const registration = isKeyboardDefinition(definition)
      ? this.createKeyboardRegistration(
        { ...definition, id },
        listener as EditorEventHandler<KeyboardEditorEvent>,
      )
      : this.createDOMRegistration(
        { ...definition, id },
        listener as EditorEventHandler<AnyEditorEvent>,
      );
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
   * Deletes either a DOM or keyboard registration by its shared stable ID.
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
      kind: "dom",
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

  private createKeyboardRegistration(
    definition: KeyboardEventDefinition,
    listener: EditorEventHandler<KeyboardEditorEvent>,
  ): KeyboardRegistration {
    const configured = Object.prototype.hasOwnProperty.call(this.keymap, definition.id)
      ? this.keymap[definition.id] ?? []
      : typeof definition.keys === "string" ? [definition.keys] : definition.keys;
    return {
      kind: "keyboard",
      id: definition.id,
      definition,
      shortcuts: configured.map(parseShortcut),
      listener,
    };
  }

  private reconnect(): void {
    this.disconnect();
    if (!this.root) return;
    const groups = new Map<string, NativeListenerGroup>();
    for (const registration of this.registrations) {
      const group: NativeListenerGroup = registration.kind === "dom"
        ? registration
        : {
          target: registration.definition.target ?? "surface",
          type: registration.definition.phase ?? "keydown",
          capture: false,
          passive: false,
        };
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

  private dispatch(group: NativeListenerGroup, raw: globalThis.Event): void {
    const root = this.root;
    if (!root || raw.defaultPrevented || this.claimedEvents.has(raw)) return;

    const event = this.createEditorEvent(group.target, raw, root);
    if (
      (group.type === "keydown" || group.type === "keyup") &&
      this.dispatchKeyboard(
        event as EditorEvent<KeyboardEventTarget, "keydown" | "keyup">,
        group.type,
      )
    ) {
      this.claim(raw);
      return;
    }

    for (const registration of [...this.registrations]) {
      if (raw.defaultPrevented || this.claimedEvents.has(raw)) return;
      if (
        registration.kind !== "dom" ||
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

  private dispatchKeyboard(
    domEvent: EditorEvent<KeyboardEventTarget, "keydown" | "keyup">,
    phase: KeyboardEventPhase,
  ): boolean {
    const raw = domEvent.raw;
    const event = new KeyboardEditorEvent({
      raw,
      editor: domEvent.editor,
      root: domEvent.root,
      mode: domEvent.mode,
      selection: domEvent.selection,
      eventTarget: domEvent.eventTarget,
      insideRoot: domEvent.insideRoot,
      blockElement: domEvent.blockElement,
      blockId: domEvent.blockId,
      contentElement: domEvent.contentElement,
      shortcut: shortcutFromKeyboardEvent(raw),
      phase,
    });
    const registrations = this.registrations
      .filter((registration): registration is KeyboardRegistration => registration.kind === "keyboard")
      .sort((left, right) => (right.definition.priority ?? 0) - (left.definition.priority ?? 0));
    for (const registration of registrations) {
      const definition = registration.definition;
      if (
        (definition.phase ?? "keydown") !== phase ||
        (definition.target ?? "surface") !== event.eventTarget ||
        !modeMatches(definition.mode, event.mode) ||
        !scopeMatches(definition.scope, event) ||
        !registration.shortcuts.some((shortcut) => matchesShortcut(shortcut, raw))
      ) continue;
      const composition = definition.composing ?? "ignore";
      if (raw.isComposing && composition === "ignore") continue;
      if (raw.isComposing && composition === "prevent") return true;
      if (definition.when && !definition.when(event)) continue;
      if (registration.listener(event)) return true;
    }
    return false;
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

const isKeyboardDefinition = (
  definition: DOMEventDefinition | KeyboardEventDefinition,
): definition is KeyboardEventDefinition => "keys" in definition;

const modeMatches = (
  expected: EditorMode | readonly EditorMode[] | undefined,
  actual: EditorMode,
): boolean => !expected ||
  (Array.isArray(expected) ? expected.includes(actual) : expected === actual);

const scopeMatches = (
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
