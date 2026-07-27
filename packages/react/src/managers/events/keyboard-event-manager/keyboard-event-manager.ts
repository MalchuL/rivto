import {
  DOMEventManager,
  type DOMEditorEventContext,
} from "../dom-event-manager";
import type { ReactEditor } from "../../../react-editor";
import type { EditorEventHandler } from "../editor-event-manager";
import {
  matchesShortcut,
  parseShortcut,
  shortcutFromKeyboardEvent,
  type ParsedShortcut,
} from "./utils/shortcut";
import type {
  KeyboardBinding,
  KeyboardEditorEventContext,
  KeyboardEventPhase,
  KeymapOverrides,
} from "./types";

export { shortcutFromKeyboardEvent } from "./utils/shortcut";

interface RegisteredBinding {
  readonly definition: KeyboardBinding;
  readonly shortcuts: ParsedShortcut[];
  readonly listener: EditorEventHandler<KeyboardEditorEventContext>;
}

/**
 * Unified DOM runtime with declarative, condition-aware keyboard bindings.
 *
 * Keymap overrides are resolved by stable binding ID when a plugin registers.
 * An empty override disables the binding. Same-key bindings run in declaration
 * order until one returns true.
 */
export class KeyboardEventManager extends DOMEventManager {
  private readonly bindings: RegisteredBinding[] = [];
  private readonly bindingIds = new Set<string>();
  private readonly bindingDisposers = new Map<string, () => void>();
  private readonly keymap: KeymapOverrides;

  /**
   * Creates the single DOM and keyboard runtime owned by ReactEditor.
   *
   * @param reactEditor - Complete owning runtime forwarded to DOM dispatch.
   * @param keymap - Creation-time semantic binding overrides.
   */
  constructor(
    reactEditor: ReactEditor,
    keymap: KeymapOverrides = {},
  ) {
    super(reactEditor);
    this.keymap = Object.fromEntries(
      Object.entries(keymap).map(([id, keys]) => [id, [...keys]]),
    );
    for (const target of ["root", "window"] as const) {
      super.on("keydown", (context) => this.dispatchKeyboard(context, "keydown"), { target });
      super.on("keyup", (context) => this.dispatchKeyboard(context, "keyup"), { target });
    }
  }

  /**
   * Registers one stable keyboard action in declaration order.
   *
   * @param definition - Semantic ID, defaults, restrictions, and condition.
   * @param listener - Action returning true when it handled the shortcut.
   * @returns Idempotent disposer releasing the binding ID for reuse.
   */
  bind(
    definition: KeyboardBinding,
    listener: EditorEventHandler<KeyboardEditorEventContext>,
  ): () => void {
    const id = definition.id.trim();
    if (!id) throw new Error("Keyboard binding ID is required");
    if (this.bindingIds.has(id)) throw new Error(`Keyboard binding ${id} is already registered`);
    const configured = Object.prototype.hasOwnProperty.call(this.keymap, id)
      ? this.keymap[id] ?? []
      : typeof definition.keys === "string" ? [definition.keys] : definition.keys;
    const registration: RegisteredBinding = {
      definition: { ...definition, id },
      shortcuts: configured.map(parseShortcut),
      listener,
    };
    this.bindingIds.add(id);
    const release = this.register(this.bindings, registration, () => undefined);
    let active = true;
    let dispose = () => undefined;
    dispose = () => {
      if (!active) return;
      active = false;
      release();
      this.bindingIds.delete(id);
      if (this.bindingDisposers.get(id) === dispose) {
        this.bindingDisposers.delete(id);
      }
    };
    this.bindingDisposers.set(id, dispose);
    return dispose;
  }

  /**
   * Deletes one semantic keyboard binding by stable ID.
   *
   * @param id - Binding identity used during registration and keymap override.
   * @returns True when a binding existed and was disposed.
   */
  delete(id: string): boolean {
    const dispose = this.bindingDisposers.get(id);
    if (!dispose) return false;
    dispose();
    return true;
  }

  override destroy(): void {
    if (this.destroyed) return;
    this.bindings.length = 0;
    this.bindingIds.clear();
    this.bindingDisposers.clear();
    super.destroy();
  }

  private dispatchKeyboard(
    domContext: DOMEditorEventContext<"root" | "window", "keydown" | "keyup">,
    phase: KeyboardEventPhase,
  ): boolean | void {
    const event = domContext.event;
    const shortcut = shortcutFromKeyboardEvent(event);
    const context = {
      ...domContext,
      event,
      shortcut,
      phase,
    } as KeyboardEditorEventContext;

    for (const binding of [...this.bindings]) {
      const definition = binding.definition;
      if (
        (definition.phase ?? "keydown") !== phase ||
        (definition.target ?? "root") !== domContext.eventTarget ||
        !this.modeMatches(definition.mode, domContext.mode) ||
        !binding.shortcuts.some((candidate) => matchesShortcut(candidate, event))
      ) continue;

      const composition = definition.composing ?? "ignore";
      if (event.isComposing && composition === "ignore") continue;
      if (event.isComposing && composition === "prevent") return true;
      if (definition.when && !definition.when(context)) continue;
      if (binding.listener(context)) return true;
    }
  }
}
