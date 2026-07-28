import type { EditorMode } from "@chulane/rivto";
import type { DOMEventScope } from "./dom-types";
import type { KeyboardEditorEvent } from "./keyboard-editor-event";

/** One exact + separated shortcut such as Primary+Shift+Z. */
export type KeyboardShortcut = string;
/** Creation-time replacement keys indexed by stable semantic binding ID. */
export type KeymapOverrides = Readonly<Record<string, readonly KeyboardShortcut[]>>;
/** Native keyboard event phase on which a binding is evaluated. */
export type KeyboardEventPhase = "keydown" | "keyup";
/** Policy used while the browser reports an active IME composition. */
export type KeyboardCompositionPolicy = "ignore" | "handle" | "prevent";
/** Keyboard listeners are attached to the surface or its window. */
export type KeyboardEventTarget = "surface" | "window";

/** Declarative semantic keyboard action. */
export interface KeyboardEventDefinition {
  /** Unique identity within the keyboard registry and keymap overrides. */
  readonly id: string;
  /** Default exact shortcuts, replaced by a matching keymap override. */
  readonly keys: KeyboardShortcut | readonly KeyboardShortcut[];
  /** Native event phase; defaults to keydown. */
  readonly phase?: KeyboardEventPhase;
  /** Attachment realm; defaults to the active surface. */
  readonly target?: KeyboardEventTarget;
  /** Optional resolved surface, block, or content requirement. */
  readonly scope?: DOMEventScope;
  /** Editor modes in which this action is eligible. */
  readonly mode?: EditorMode | readonly EditorMode[];
  /** IME policy; defaults to ignore. */
  readonly composing?: KeyboardCompositionPolicy;
  /** Dynamic availability predicate evaluated after shortcut matching. */
  readonly when?: (event: KeyboardEditorEvent) => boolean;
}
