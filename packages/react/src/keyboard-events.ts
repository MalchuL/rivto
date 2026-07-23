import type { EditorMode } from "@chulane/rivto";
import { EditorEvents, type EditorEventContext } from "./events";

export type KeyboardShortcut = string;

export interface KeyboardBindingOptions {
  readonly mode?: EditorMode | readonly EditorMode[];
}

type Binding = {
  shortcuts: readonly string[];
  listener: (context: EditorEventContext<"keydown">) => void;
  options?: KeyboardBindingOptions;
};

/** Exact, portable key bindings layered over delegated keydown events. */
export class KeyboardEvents {
  private readonly bindings: Binding[] = [];
  private readonly disposeKeydown: () => void;

  constructor(events: EditorEvents) {
    this.disposeKeydown = events.on("keydown", (context) => this.dispatch(context));
  }

  /** Registers one or more shortcuts; an empty list disables the binding. */
  bind(
    shortcuts: KeyboardShortcut | readonly KeyboardShortcut[],
    listener: (context: EditorEventContext<"keydown">) => void,
    options?: KeyboardBindingOptions,
  ): () => void {
    const binding: Binding = {
      shortcuts: (typeof shortcuts === "string" ? [shortcuts] : shortcuts).map(normalizeShortcut),
      listener,
      options,
    };
    this.bindings.push(binding);
    return () => {
      const index = this.bindings.indexOf(binding);
      if (index >= 0) this.bindings.splice(index, 1);
    };
  }

  /** Removes the delegated listener and every binding. */
  destroy(): void {
    this.disposeKeydown();
    this.bindings.length = 0;
  }

  private dispatch(context: EditorEventContext<"keydown">): void {
    const shortcut = shortcutFromKeyboardEvent(context.event);
    const mode = context.editor.mode.get();
    for (const binding of [...this.bindings]) {
      if (context.event.defaultPrevented) break;
      const modes = binding.options?.mode;
      if (modes && !(Array.isArray(modes) ? modes.includes(mode) : modes === mode)) continue;
      if (binding.shortcuts.includes(shortcut)) binding.listener(context);
    }
  }
}

const normalizeKey = (key: string): string => {
  if (key === " ") return "Space";
  return key.length === 1 ? key.toLowerCase() : `${key[0]?.toUpperCase()}${key.slice(1)}`;
};

const normalizeShortcut = (shortcut: string): string => {
  const parts = shortcut.split("+").filter(Boolean);
  const key = normalizeKey(parts.pop() ?? "");
  const modifiers = new Set(parts.map((part) => part.toLowerCase()));
  return [
    modifiers.has("primary") ? "Primary" : "",
    modifiers.has("ctrl") ? "Ctrl" : "",
    modifiers.has("meta") ? "Meta" : "",
    modifiers.has("alt") ? "Alt" : "",
    modifiers.has("shift") ? "Shift" : "",
    key,
  ].filter(Boolean).join("+");
};

export const shortcutFromKeyboardEvent = (event: KeyboardEvent): string => [
  event.ctrlKey || event.metaKey ? "Primary" : "",
  event.ctrlKey && event.metaKey ? "Meta" : "",
  event.altKey ? "Alt" : "",
  event.shiftKey ? "Shift" : "",
  normalizeKey(event.key),
].filter(Boolean).join("+");
