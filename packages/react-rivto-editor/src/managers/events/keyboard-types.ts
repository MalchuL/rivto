import type { EditorMode } from "@chulane/rivto";
import type { DOMEventScope } from "./dom-types";
import type { KeyboardEditorEvent } from "./keyboard-editor-event";

/** One exact + separated shortcut such as Primary+Shift+Z. */
export type KeyboardShortcut = string;
/**
 * Runtime replacement keys indexed by stable semantic binding ID.
 *
 * Unknown IDs are retained for future registrations so a typo stays visible
 * in the inventory as an uninstalled override.
 */
export type KeymapOverrides = Readonly<Record<string, readonly KeyboardShortcut[]>>;

/** Immutable view of one installed or orphan keyboard binding. */
export interface KeyboardBindingSnapshot {
  readonly id: string;
  readonly defaultKeys: readonly KeyboardShortcut[];
  readonly keys: readonly KeyboardShortcut[];
  readonly overridden: boolean;
  readonly disabled: boolean;
  readonly installed: boolean;
  readonly phase: KeyboardEventPhase;
  readonly target: KeyboardEventTarget;
  readonly scope?: DOMEventScope;
  readonly mode?: EditorMode | readonly EditorMode[];
  readonly priority: number;
  readonly conflicts: readonly string[];
}
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
  /** Higher values run first; equal priorities retain registration order. */
  readonly priority?: number;
  /** Dynamic availability predicate evaluated after shortcut matching. */
  readonly when?: (event: KeyboardEditorEvent) => boolean;
}
