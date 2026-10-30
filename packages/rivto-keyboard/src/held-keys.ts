import { Listeners } from "@chulane/rivto-utils";

import {
  matchesShortcut,
  parseShortcut,
  resolvePrimaryModifier,
  type ParsedShortcut,
} from "./shortcut";

/** Native modifier state also available on pointer input. */
export interface KeyboardModifiers {
  readonly ctrlKey: boolean;
  readonly metaKey: boolean;
  readonly altKey: boolean;
  readonly shiftKey: boolean;
}

/** Captured binding configuration; physical state stays live during a gesture. */
export class HeldKeyBinding {
  private readonly shortcuts: readonly ParsedShortcut[];

  /**
   * Captures effective shortcuts independently of later keymap edits.
   *
   * @param keys - Effective shortcuts at gesture start; empty disables the binding.
   */
  constructor(keys: readonly string[]) {
    this.shortcuts = keys.map((key) => {
      if (key === "Primary") {
        return parseShortcut(resolvePrimaryModifier() === "meta" ? "Meta" : "Control");
      }
      return parseShortcut(key);
    });
  }

  /**
   * Tests captured configuration against current physical state.
   *
   * @param state - Live held-key tracker.
   * @returns Whether at least one configured shortcut is held.
   */
  matches(state: HeldKeys): boolean {
    return this.shortcuts.some((shortcut) => state.matches(shortcut));
  }
}

/** Tracks physical keys without consuming text input or installing native listeners. */
export class HeldKeys {
  private readonly keys = new Map<string, KeyboardEvent>();
  private modifiers: KeyboardModifiers = {
    ctrlKey: false,
    metaKey: false,
    altKey: false,
    shiftKey: false,
  };
  private readonly listeners = new Listeners<{ changed: void }>();

  /**
   * Updates physical state before shortcut dispatch.
   *
   * @param event - Native keydown or keyup; repeated keydown retains one entry.
   * @returns State observers are notified after the update.
   */
  update(event: KeyboardEvent): void {
    const id = event.code || event.key;
    if (event.type === "keyup") {
      this.keys.delete(id);
    } else {
      this.keys.set(id, event);
    }
    this.reconcile(event);
    this.listeners.emit("changed");
  }

  /**
   * Reconciles modifiers from pointer input, including missed keydown and keyup.
   *
   * @param modifiers - Current native modifier flags.
   * @returns Modifier state and observers are updated without consuming input.
   */
  reconcile(modifiers: KeyboardModifiers): void {
    const previous = this.modifiers;
    if (
      previous.ctrlKey === modifiers.ctrlKey &&
      previous.metaKey === modifiers.metaKey &&
      previous.altKey === modifiers.altKey &&
      previous.shiftKey === modifiers.shiftKey
    ) {
      return;
    }
    this.modifiers = {
      ctrlKey: modifiers.ctrlKey,
      metaKey: modifiers.metaKey,
      altKey: modifiers.altKey,
      shiftKey: modifiers.shiftKey,
    };
    this.listeners.emit("changed");
  }

  /**
   * Clears held state after blur, visibility loss, or transport detachment.
   *
   * @returns No keys remain held and observers have been notified.
   */
  reset(): void {
    this.keys.clear();
    this.listeners.emit("changed");
    this.reconcile({ ctrlKey: false, metaKey: false, altKey: false, shiftKey: false });
  }

  /**
   * Observes changes to held state independently of keymap revisions.
   *
   * @param listener - Callback reading current state after native input or reset.
   * @returns Disposer removing this observer.
   */
  subscribe(listener: () => void): () => void {
    return this.listeners.subscribe("changed", listener);
  }

  /**
   * Matches an exact shortcut against held ordinary keys and reconciled modifiers.
   *
   * @param shortcut - Parsed captured shortcut.
   * @returns Whether the key and required modifier flags are currently held.
   */
  matches(shortcut: ParsedShortcut): boolean {
    const modifiers = this.modifiers;
    for (const [key, down] of [
      ["Control", modifiers.ctrlKey],
      ["Meta", modifiers.metaKey],
      ["Alt", modifiers.altKey],
      ["Shift", modifiers.shiftKey],
    ] as const) {
      if (down && matchesShortcut(shortcut, { key, code: "", ...modifiers })) {
        return true;
      }
    }
    for (const event of this.keys.values()) {
      if (
        !["Control", "Meta", "Alt", "Shift"].includes(event.key) &&
        matchesShortcut(shortcut, { key: event.key, code: event.code, ...modifiers })
      ) {
        return true;
      }
    }
    return false;
  }
}
