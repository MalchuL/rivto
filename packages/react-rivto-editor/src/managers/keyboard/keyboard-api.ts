import type { EditorEventHandler } from "../events/types";
import type { KeyboardBindingSnapshot, KeyboardEventDefinition, KeyboardShortcut, KeymapOverrides } from "./keyboard-types";
import type { KeyboardEditorEvent } from "./keyboard-editor-event";

/** Semantic keyboard registrations, inventory, and shared keymap settings. */
export interface KeyboardApi {
  /** Registers one stable semantic action and returns its idempotent disposer. */
  register(
    definition: KeyboardEventDefinition,
    listener: EditorEventHandler<KeyboardEditorEvent>,
  ): () => void;
  /** Deletes a registered semantic action by ID. */
  delete(id: string): boolean;
  /** Returns an immutable snapshot of installed bindings and orphan overrides. */
  list(): readonly KeyboardBindingSnapshot[];
  /** Increments when registrations or overrides change. */
  readonly revision: number;
  /** Subscribes to inventory revisions. */
  subscribe(listener: () => void): () => void;
  /** Replaces every override, restoring defaults for omitted IDs. */
  replaceKeymap(keymap: KeymapOverrides): void;
  /** Sets one override; an empty array disables it and undefined restores defaults. */
  setKeymapOverride(
    id: string,
    keys: readonly KeyboardShortcut[] | undefined,
  ): void;
}
