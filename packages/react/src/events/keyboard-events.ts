import type { EditorMode } from "@chulane/rivto";
import {
  DOMEditorEvents,
  type DOMEditorEventContext,
  type DOMEditorEventTarget,
  type EditorEventHandler,
} from "./events";
import {
  matchesShortcut,
  parseShortcut,
  shortcutFromKeyboardEvent,
  type ParsedShortcut,
} from "./utils/keyboard/shortcut";

export { shortcutFromKeyboardEvent } from "./utils/keyboard/shortcut";

export type KeyboardShortcut = string;
export type KeymapOverrides = Readonly<Record<string, readonly KeyboardShortcut[]>>;
export type KeyboardEventPhase = "keydown" | "keyup";
export type KeyboardCompositionPolicy = "ignore" | "handle" | "prevent";

export interface KeyboardEditorEventContext
  extends DOMEditorEventContext<"root", "keydown"> {
  readonly shortcut: string;
  readonly phase: KeyboardEventPhase;
}

export interface KeyboardBinding {
  readonly id: string;
  readonly keys: KeyboardShortcut | readonly KeyboardShortcut[];
  readonly phase?: KeyboardEventPhase;
  readonly target?: Extract<DOMEditorEventTarget, "root" | "window">;
  readonly mode?: EditorMode | readonly EditorMode[];
  readonly composing?: KeyboardCompositionPolicy;
  readonly when?: (context: KeyboardEditorEventContext) => boolean;
}

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
export class KeyboardEditorEvents extends DOMEditorEvents {
  private readonly bindings: RegisteredBinding[] = [];
  private readonly bindingIds = new Set<string>();
  private readonly keymap: KeymapOverrides;

  constructor(
    editor: ConstructorParameters<typeof DOMEditorEvents>[0],
    getMode: ConstructorParameters<typeof DOMEditorEvents>[1],
    keymap: KeymapOverrides = {},
  ) {
    super(editor, getMode);
    this.keymap = Object.fromEntries(
      Object.entries(keymap).map(([id, keys]) => [id, [...keys]]),
    );
    for (const target of ["root", "window"] as const) {
      super.on("keydown", (context) => this.dispatchKeyboard(context, "keydown"), { target });
      super.on("keyup", (context) => this.dispatchKeyboard(context, "keyup"), { target });
    }
  }

  /** Registers one stable keyboard action and returns its disposer. */
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
    const dispose = this.register(this.bindings, registration, () => undefined);
    return () => {
      dispose();
      this.bindingIds.delete(id);
    };
  }

  override destroy(): void {
    if (this.destroyed) return;
    this.bindings.length = 0;
    this.bindingIds.clear();
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
