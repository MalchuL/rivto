import { EditorEvent } from "../events/editor-event";
import type { KeyboardEventPhase, KeyboardEventTarget } from "./keyboard-types";
import type { KeyboardEditorEventInit } from "./types";

/** Editor event enriched with centrally normalized keyboard information. */
export class KeyboardEditorEvent extends EditorEvent<KeyboardEventTarget, "keydown" | "keyup"> {
  readonly shortcut: string;
  readonly phase: KeyboardEventPhase;

  /** Creates one keyboard event value shared by predicates and handlers. */
  constructor(init: KeyboardEditorEventInit) {
    super(init);
    this.shortcut = init.shortcut;
    this.phase = init.phase;
  }
}
