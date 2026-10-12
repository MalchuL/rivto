import type { EditorEvent } from "../events/editor-event";
import type { DocumentViewScope, EditorEventHandler, EditorEventInit } from "../events/types";
import type { KeyboardEventDefinition, KeyboardEventPhase, KeyboardEventTarget } from "./keyboard-types";
import type { KeyboardEditorEvent } from "./keyboard-editor-event";
import type { ParsedShortcut } from "./shortcut";

/** Values required to construct one normalized keyboard editor event. */
export interface KeyboardEditorEventInit
  extends EditorEventInit<
    KeyboardEventTarget,
    "keydown" | "keyup"
  > {
  /** Exact shortcut normalized from raw. */
  readonly shortcut: string;
  /** Native keyboard phase which produced the dispatch. */
  readonly phase: KeyboardEventPhase;
}

export interface KeyboardRegistration {
  readonly owner?: DocumentViewScope;
  readonly definition: KeyboardEventDefinition;
  shortcuts: ParsedShortcut[];
  readonly listener: EditorEventHandler<KeyboardEditorEvent>;
}

export type KeyboardDOMEvent =
  | EditorEvent<"surface", "keydown">
  | EditorEvent<"surface", "keyup">
  | EditorEvent<"window", "keydown">
  | EditorEvent<"window", "keyup">;
