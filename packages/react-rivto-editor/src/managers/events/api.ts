import type { DOMEventDefinition, DOMEventName, DOMEventTarget } from "./dom-types";
import type { EditorEvent } from "./editor-event";
import type { EditorEventHandler } from "./types";

/** Event registrations for one EditorPanel. */
export interface PanelEventsApi {
  /**
   * Registers a handler restricted to this panel, with automatic panel cleanup.
   *
   * Additions during native delivery wait for a later event. Removals take effect
   * immediately, including handlers waiting in later native phases.
   *
   * @param definition - Event type, optional filters and listener options, and an ID unique in this panel.
   * @param listener - Returning true stops later editor handlers and requests browser-default cancellation.
   * @returns Idempotent function that removes the registration before panel cleanup.
   * @throws If the ID is empty, already registered in this panel, or the runtime is destroyed.
   */
  register<
    Target extends DOMEventTarget = "surface",
    Type extends DOMEventName<Target> = DOMEventName<Target>,
  >(
    definition: DOMEventDefinition<Target, Type>,
    listener: EditorEventHandler<EditorEvent<Target, Type>>,
  ): () => void;
  /**
   * Removes a registration from this panel without affecting other panels.
   * @param id - Local registration ID, without the internal panel prefix.
   * @returns Whether a matching registration was removed.
   */
  delete(id: string): boolean;
}
