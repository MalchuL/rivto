import { matchesShortcut, parseShortcut } from "./shortcut";
import type { HeldKey } from "./internal/types";

import type {
  KeyboardEventPhase,
  KeyboardKey,
  KeyboardModifiers,
  ParsedShortcut,
  PrimaryModifier,
} from "./types";

/** Captured binding configuration; physical state stays live during a gesture. */
export class HeldKeyBinding {
  private readonly shortcuts: readonly ParsedShortcut[];

  /**
   * Captures effective shortcuts independently of later keymap edits.
   *
   * @param keys - Effective shortcuts at gesture start; empty disables the binding.
   * @param primary - Platform modifier represented by Primary; defaults to Ctrl.
   */
  constructor(keys: readonly string[], primary: PrimaryModifier = "ctrl") {
    this.shortcuts = keys.map((key) => {
      if (key === "Primary") {
        return parseShortcut(primary === "meta" ? "Meta" : "Control");
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
  private readonly keys = new Map<string, HeldKey>();
  private modifiers: KeyboardModifiers = {
    ctrlKey: false,
    metaKey: false,
    altKey: false,
    shiftKey: false,
  };
  private readonly listeners = new Set<() => void>();

  /**
   * Creates a tracker using the host's platform modifier policy.
   *
   * @param primaryModifier - Modifier represented by Primary; defaults to Ctrl.
   */
  constructor(readonly primaryModifier: PrimaryModifier = "ctrl") {}

  /**
   * Updates physical state before shortcut dispatch.
   *
   * @param event - Logical key, physical code and current modifier flags.
   * @param phase - Whether the key was pressed or released; repeated presses retain one entry.
   * @returns State observers are notified after the update.
   * @throws AggregateError after notifying observers if any observer fails.
   */
  update(event: KeyboardKey, phase: KeyboardEventPhase): void {
    const id = event.code || event.key;
    if (phase === "keyup") {
      this.keys.delete(id);
    } else {
      this.keys.set(id, { key: event.key, code: event.code });
    }
    this.reconcile(event);
    this.notify();
  }

  /**
   * Reconciles modifiers from pointer input, including missed keydown and keyup.
   *
   * @param modifiers - Current native modifier flags.
   * @returns Modifier state and observers are updated without consuming input.
   * @throws AggregateError after notifying observers if any observer fails.
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
    this.notify();
  }

  /**
   * Clears held state after blur, visibility loss, or transport detachment.
   *
   * @returns No keys remain held and observers have been notified.
   * @throws AggregateError after attempting every initial observer and modifier reset.
   */
  reset(): void {
    this.keys.clear();
    const errors: unknown[] = [];
    try {
      this.notify();
    } catch (error) {
      errors.push(error);
    }
    try {
      this.reconcile({ ctrlKey: false, metaKey: false, altKey: false, shiftKey: false });
    } catch (error) {
      errors.push(error);
    }
    if (errors.length) {
      throw new AggregateError(errors, "Held-key reset notification failed");
    }
  }

  /**
   * Observes changes to held state independently of keymap revisions.
   *
   * @param listener - Callback reading current state after native input or reset.
   * @returns Disposer removing this observer.
   */
  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
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
      if (
        down &&
        matchesShortcut(shortcut, { key, code: "", ...modifiers }, this.primaryModifier)
      ) {
        return true;
      }
    }
    for (const event of this.keys.values()) {
      if (
        !["Control", "Meta", "Alt", "Shift"].includes(event.key) &&
        matchesShortcut(
          shortcut,
          { key: event.key, code: event.code, ...modifiers },
          this.primaryModifier,
        )
      ) {
        return true;
      }
    }
    return false;
  }

  /**
   * Notifies a snapshot of held-state observers without stopping at the first failure.
   *
   * @returns Every observer in the snapshot has been offered the notification.
   * @throws AggregateError containing all observer failures.
   */
  private notify(): void {
    let errors: unknown[] | undefined;
    for (const listener of [...this.listeners]) {
      try {
        listener();
      } catch (error) {
        (errors ??= []).push(error);
      }
    }
    if (errors) {
      throw new AggregateError(errors, "Held-key observer notification failed");
    }
  }
}
