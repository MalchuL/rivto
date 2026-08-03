import {
  EditorEvent,
  type EditorEventInit,
} from "./editor-event";
import type {
  KeyboardEventPhase,
  KeyboardEventTarget,
} from "./keyboard-types";

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

/** Editor event enriched with centrally normalized keyboard information. */
export class KeyboardEditorEvent extends EditorEvent<
  KeyboardEventTarget,
  "keydown" | "keyup"
> {
  readonly shortcut: string;
  readonly phase: KeyboardEventPhase;

  /** Creates one keyboard event value shared by predicates and handlers. */
  constructor(init: KeyboardEditorEventInit) {
    super(init);
    this.shortcut = init.shortcut;
    this.phase = init.phase;
  }
}
