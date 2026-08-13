import type { ReactEditorImpl } from "../../react-editor";
import type { KeyboardCapability } from "../../capabilities";
import type { EditorEvent } from "./editor-event";
import { modeMatches, scopeMatches } from "./event-manager";
import { KeyboardEditorEvent } from "./keyboard-editor-event";
import type {
  KeyboardEventDefinition,
  KeyboardEventPhase,
  KeyboardShortcut,
  KeymapOverrides,
} from "./keyboard-types";
import {
  matchesShortcut,
  parseShortcut,
  shortcutFromKeyboardEvent,
  type ParsedShortcut,
} from "./shortcut";
import type { EditorEventHandler } from "./types";

interface KeyboardRegistration {
  readonly definition: KeyboardEventDefinition;
  shortcuts: ParsedShortcut[];
  readonly listener: EditorEventHandler<KeyboardEditorEvent>;
}

type KeyboardDOMEvent =
  | EditorEvent<"surface", "keydown">
  | EditorEvent<"surface", "keyup">
  | EditorEvent<"window", "keydown">
  | EditorEvent<"window", "keyup">;

/** Owns semantic keyboard bindings while EventManager owns native transport. */
export class KeyboardManager implements KeyboardCapability {
  private readonly registrations: KeyboardRegistration[] = [];
  private readonly registrationIds = new Set<string>();
  private readonly registrationDisposers = new Map<string, () => void>();
  private readonly transportDisposers: Array<() => void>;
  private keymap: KeymapOverrides;
  private destroyed = false;

  /**
   * Creates keyboard transport before extensions register DOM or keyboard behavior.
   *
   * @param reactEditor - Complete owning React runtime.
   * @param keymap - Initial semantic binding overrides.
   */
  constructor(
    private readonly reactEditor: ReactEditorImpl,
    keymap: KeymapOverrides = {},
  ) {
    this.keymap = cloneKeymap(keymap);
    validateKeymap(this.keymap);
    const events = reactEditor.events;
    this.transportDisposers = [
      events.register<"surface", "keydown">({
        id: "rivto.keyboard.surface.keydown",
        type: "keydown",
      }, (event) => this.dispatch(event, "keydown")),
      events.register<"surface", "keyup">({
        id: "rivto.keyboard.surface.keyup",
        type: "keyup",
      }, (event) => this.dispatch(event, "keyup")),
      events.register<"window", "keydown">({
        id: "rivto.keyboard.window.keydown",
        type: "keydown",
        target: "window",
      }, (event) => this.dispatch(event, "keydown")),
      events.register<"window", "keyup">({
        id: "rivto.keyboard.window.keyup",
        type: "keyup",
        target: "window",
      }, (event) => this.dispatch(event, "keyup")),
    ];
  }

  /**
   * Registers one semantic keyboard action in declaration order.
   *
   * @param definition - Stable ID, default keys, filters, and composition policy.
   * @param listener - Handler returning true when it claims the native event.
   * @returns Idempotent disposer which releases the keyboard ID for reuse.
   */
  register(
    definition: KeyboardEventDefinition,
    listener: EditorEventHandler<KeyboardEditorEvent>,
  ): () => void {
    this.assertActive();
    const id = definition.id.trim();
    if (!id) throw new Error("Keyboard registration ID is required");
    if (this.registrationIds.has(id)) {
      throw new Error(`Keyboard registration ${id} is already registered`);
    }
    const normalized = {
      ...definition,
      id,
      keys: typeof definition.keys === "string"
        ? definition.keys
        : [...definition.keys],
    };
    const registration: KeyboardRegistration = {
      definition: normalized,
      shortcuts: this.resolveShortcuts(normalized, this.keymap),
      listener,
    };
    this.registrationIds.add(id);
    this.registrations.push(registration);

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
    });
    this.registrationDisposers.set(id, dispose);
    return dispose;
  }

  /**
   * Deletes one keyboard registration by its stable semantic ID.
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
   * Atomically replaces every override and restores defaults for omitted IDs.
   *
   * @param keymap - Complete next override map; empty arrays disable bindings.
   */
  replaceKeymap(keymap: KeymapOverrides): void {
    this.assertActive();
    this.applyKeymap(cloneKeymap(keymap));
  }

  /**
   * Atomically replaces one override without reinstalling its handler.
   *
   * @param id - Existing or future semantic binding ID.
   * @param keys - Replacement shortcuts, an empty array to disable, or undefined
   * to restore the binding's declared defaults.
   */
  setKeymapOverride(
    id: string,
    keys: readonly KeyboardShortcut[] | undefined,
  ): void {
    this.assertActive();
    const next = cloneKeymap(this.keymap);
    if (keys === undefined) delete next[id];
    else next[id] = [...keys];
    this.applyKeymap(next);
  }

  /** Releases semantic registrations and native keyboard transport. */
  destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    [...this.registrationDisposers.values()].reverse().forEach((dispose) => dispose());
    this.transportDisposers.reverse().forEach((dispose) => dispose());
    this.registrationDisposers.clear();
    this.registrationIds.clear();
    this.registrations.length = 0;
  }

  private applyKeymap(keymap: KeymapOverrides): void {
    validateKeymap(keymap);
    const shortcuts = this.registrations.map(({ definition }) => (
      this.resolveShortcuts(definition, keymap)
    ));
    this.keymap = keymap;
    this.registrations.forEach((registration, index) => {
      registration.shortcuts = shortcuts[index]!;
    });
  }

  private resolveShortcuts(
    definition: KeyboardEventDefinition,
    keymap: KeymapOverrides,
  ): ParsedShortcut[] {
    const configured = Object.prototype.hasOwnProperty.call(keymap, definition.id)
      ? keymap[definition.id] ?? []
      : typeof definition.keys === "string" ? [definition.keys] : definition.keys;
    return configured.map(parseShortcut);
  }

  private dispatch(
    domEvent: KeyboardDOMEvent,
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
    const registrations = [...this.registrations]
      .sort((left, right) => (right.definition.priority ?? 0) - (left.definition.priority ?? 0));
    let handled = false;
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
      if (raw.isComposing && composition === "prevent") {
        handled = true;
        break;
      }
      if (definition.when && !definition.when(event)) continue;
      if (registration.listener(event)) {
        handled = true;
        break;
      }
    }
    return handled;
  }

  private assertActive(): void {
    if (this.destroyed) throw new Error("Keyboard runtime is destroyed");
    this.reactEditor.extensions.assertActive();
  }
}

const cloneKeymap = (keymap: KeymapOverrides): Record<string, readonly KeyboardShortcut[]> =>
  Object.fromEntries(Object.entries(keymap).map(([id, keys]) => [id, [...keys]]));

const validateKeymap = (keymap: KeymapOverrides): void => {
  Object.values(keymap).forEach((keys) => keys.forEach(parseShortcut));
};
