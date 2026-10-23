import type {
  KeyboardTransport,
  KeyboardBindingSnapshot as RuntimeSnapshot,
} from "@chulane/rivto-keyboard";
import type { EditorMode } from "@chulane/rivto";
import type { EventManager } from "../events/event-manager";
import { modeMatches, scopeMatches } from "../events/event-manager";
import { KeyboardEditorEvent } from "./keyboard-editor-event";
import { shortcutFromKeyboardEvent } from "./shortcut";
import type { KeyboardDOMEvent } from "./types";
import type {
  KeyboardEventDefinition,
  KeyboardBindingSnapshot,
  KeyboardEventPhase,
} from "./keyboard-types";

/** Adapts React panel input and filters to the independent keyboard runtime. */
export class ReactKeyboardTransport implements KeyboardTransport<
  KeyboardEditorEvent,
  KeyboardEventDefinition,
  KeyboardBindingSnapshot
> {
  readonly defaultTarget = "surface";

  /**
   * Borrows event registration without taking ownership of the event manager.
   *
   * @param events - Host event registration capability.
   */
  constructor(private readonly events: Pick<EventManager, "register">) {}

  /**
   * Installs the existing surface and window keyboard routes.
   *
   * @param dispatch - Runtime action dispatcher.
   * @returns Disposer removing all four host registrations.
   */
  connect(dispatch: (event: KeyboardEditorEvent) => boolean): () => void {
    const disposers: Array<() => void> = [];
    for (const target of ["surface", "window"] as const) {
      for (const phase of ["keydown", "keyup"] as const) {
        disposers.push(
          this.events.register(
            { id: `rivto.keyboard.${target}.${phase}`, type: phase, target },
            (event) => dispatch(this.createEvent(event, phase)),
          ),
        );
      }
    }
    return () => disposers.reverse().forEach((dispose) => dispose());
  }

  /**
   * Applies host mode and DOM scope restrictions.
   *
   * @param definition - Host action definition.
   * @param event - Resolved panel context.
   * @returns Whether both host filters match.
   */
  matches(definition: KeyboardEventDefinition, event: KeyboardEditorEvent): boolean {
    return modeMatches(definition.mode, event.mode) && scopeMatches(definition.scope, event);
  }

  /**
   * Preserves host metadata in the keyboard inventory.
   *
   * @param snapshot - Independent runtime inventory values.
   * @param definition - Installed action or undefined for an orphan override.
   * @returns Inventory row including original mode and scope restrictions.
   */
  describe(
    snapshot: RuntimeSnapshot,
    definition: KeyboardEventDefinition | undefined,
  ): KeyboardBindingSnapshot {
    return {
      ...snapshot,
      target: definition?.target ?? "surface",
      mode: definition?.mode,
      scope: definition?.scope,
    };
  }

  /**
   * Compares host filters without evaluating dynamic predicates.
   *
   * @param left - First action inventory entry.
   * @param right - Second action inventory entry.
   * @returns Whether modes overlap and scopes are equal.
   */
  overlaps(left: KeyboardBindingSnapshot, right: KeyboardBindingSnapshot): boolean {
    return left.scope === right.scope && this.modesOverlap(left.mode, right.mode);
  }

  /**
   * Enriches existing panel context with portable keyboard metadata.
   *
   * @param event - Host DOM keyboard event.
   * @param phase - Native phase being dispatched.
   * @returns Shared normalized keyboard context.
   */
  private createEvent(event: KeyboardDOMEvent, phase: KeyboardEventPhase): KeyboardEditorEvent {
    return new KeyboardEditorEvent({
      ...event,
      shortcut: shortcutFromKeyboardEvent(event.raw),
      phase,
    });
  }

  /**
   * Treats an omitted mode as every mode.
   *
   * @param left - Optional mode filter.
   * @param right - Optional mode filter.
   * @returns True when the filters can both match one editor mode.
   */
  private modesOverlap(
    left?: EditorMode | readonly EditorMode[],
    right?: EditorMode | readonly EditorMode[],
  ): boolean {
    if (left === undefined || right === undefined) {
      return true;
    }
    const modes = new Set(Array.isArray(left) ? left : [left]);
    return (Array.isArray(right) ? right : [right]).some((mode) => modes.has(mode));
  }
}
