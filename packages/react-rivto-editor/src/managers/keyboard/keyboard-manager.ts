import { KeyboardRuntime } from "@chulane/rivto-keyboard";
import type { RegistrationOwner } from "../extensions/types";
import type { EventManager } from "../events/event-manager";
import type { EditorEventHandler } from "../events/types";
import type { PanelRegistration } from "../../panels/types";
import type { KeyboardEditorEvent } from "./keyboard-editor-event";
import type {
  KeyboardBindingSnapshot,
  KeyboardEventDefinition,
  KeymapOverrides,
} from "./keyboard-types";
import { ReactKeyboardTransport } from "./keyboard-transport";

/** Owns semantic keyboard bindings while EventManager owns native transport. */
export class KeyboardManager extends KeyboardRuntime<
  KeyboardEditorEvent,
  KeyboardEventDefinition,
  KeyboardBindingSnapshot
> {
  /**
   * Creates keyboard transport before extensions register DOM or keyboard behavior.
   *
   * @param events - Borrowed host event registration capability.
   * @param extensions - Internal registration ownership and destruction guard.
   * @param keymap - Initial semantic binding overrides.
   */
  constructor(
    events: Pick<EventManager, "register">,
    extensions: RegistrationOwner,
    keymap: KeymapOverrides = {},
  ) {
    super(new ReactKeyboardTransport(events), extensions, keymap);
  }

  /**
   * Registers one semantic keyboard action in declaration order.
   *
   * Panel-local copies share a semantic override but retain independent cleanup.
   *
   * @param definition - Stable ID, default keys, filters, and composition policy.
   * @param listener - Handler returning true when it claims the native event.
   * @param owner - Optional panel restricting dispatch to its currently mounted root.
   * @returns Idempotent disposer which releases the keyboard ID for reuse.
   */
  register(
    definition: KeyboardEventDefinition,
    listener: EditorEventHandler<KeyboardEditorEvent>,
    owner?: Pick<PanelRegistration, "id" | "getRoot">,
  ): () => void {
    const id = definition.id.trim();
    return this.registerBinding(definition, listener, {
      id: owner ? `${owner.id}:${id}` : id,
      accepts: owner ? (event) => owner.getRoot() === event.root : undefined,
    });
  }
}
