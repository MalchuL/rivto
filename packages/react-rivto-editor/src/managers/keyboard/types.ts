import type { EditorEvent } from "../events/editor-event";
import type { EditorEventInit } from "../events/types";
import type { KeyboardEventPhase, KeyboardEventTarget } from "./keyboard-types";

/** Values required to construct one normalized keyboard editor event. */
export interface KeyboardEditorEventInit extends EditorEventInit<
  KeyboardEventTarget,
  "keydown" | "keyup"
> {
  /** Exact shortcut normalized from raw. */
  readonly shortcut: string;
  /** Native keyboard phase which produced the dispatch. */
  readonly phase: KeyboardEventPhase;
}

export type KeyboardDOMEvent =
  | EditorEvent<"surface", "keydown">
  | EditorEvent<"surface", "keyup">
  | EditorEvent<"window", "keydown">
  | EditorEvent<"window", "keyup">;
