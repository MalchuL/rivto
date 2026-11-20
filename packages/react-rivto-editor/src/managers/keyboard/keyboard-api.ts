import type { PanelEventScope } from "../events/api";
import type { EditorEventHandler } from "../events/types";
import type {
  KeyboardBindingSnapshot,
  KeyboardEventDefinition,
  KeyboardShortcut,
  KeymapOverrides,
} from "./keyboard-types";
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
  setKeymapOverride(id: string, keys: readonly KeyboardShortcut[] | undefined): void;
}

/** Shared document keymap with optional panel-scoped handler registration. */
export interface DocumentKeyboardApi extends KeyboardApi {
  /**
   * Registers a semantic shortcut for the document or for one panel occurrence.
   *
   * @param definition - Semantic action ID and its default shortcuts.
   * @param listener - Handler receiving the matched keyboard event.
   * @param owner - Optional panel whose root and identity scope the binding.
   * @returns Idempotent disposer for this binding.
   * @throws If registration fails or the runtime is inactive.
   */
  register(
    definition: KeyboardEventDefinition,
    listener: EditorEventHandler<KeyboardEditorEvent>,
    owner?: PanelEventScope,
  ): () => void;
}
