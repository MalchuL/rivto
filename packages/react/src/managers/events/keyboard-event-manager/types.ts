import type { EditorMode } from "@chulane/rivto";
import type {
  DOMEditorEventContext,
  DOMEditorEventTarget,
} from "../dom-event-manager";

/** One exact, `+`-separated shortcut such as `Primary+Shift+Z`. */
export type KeyboardShortcut = string;
/** Creation-time replacement keys indexed by stable semantic binding ID. */
export type KeymapOverrides = Readonly<Record<string, readonly KeyboardShortcut[]>>;
/** Native keyboard event phase on which a binding is evaluated. */
export type KeyboardEventPhase = "keydown" | "keyup";
/**
 * Policy used while the browser reports an active IME composition.
 *
 * `ignore` skips the binding, `handle` runs it, and `prevent` claims the native
 * event without executing the action.
 */
export type KeyboardCompositionPolicy = "ignore" | "handle" | "prevent";

/** DOM context enriched with the centrally normalized shortcut and phase. */
export interface KeyboardEditorEventContext
  extends DOMEditorEventContext<"root", "keydown"> {
  /** Human-readable shortcut produced from the native event. */
  readonly shortcut: string;
  /** Phase which matched this registration. */
  readonly phase: KeyboardEventPhase;
}

/** Declarative keyboard action matched centrally by KeyboardEventManager. */
export interface KeyboardBinding {
  /** Unique semantic identity used by keymap overrides and duplicate checks. */
  readonly id: string;
  /** Default exact shortcuts, replaced when an override exists for `id`. */
  readonly keys: KeyboardShortcut | readonly KeyboardShortcut[];
  /** Native event phase; defaults to `keydown`. */
  readonly phase?: KeyboardEventPhase;
  /** Listener realm; defaults to the active surface root. */
  readonly target?: Extract<DOMEditorEventTarget, "root" | "window">;
  /** Presentation modes in which this action is eligible. */
  readonly mode?: EditorMode | readonly EditorMode[];
  /** IME policy; defaults to `ignore`. */
  readonly composing?: KeyboardCompositionPolicy;
  /** Optional state predicate evaluated after shortcut and mode matching. */
  readonly when?: (context: KeyboardEditorEventContext) => boolean;
}
