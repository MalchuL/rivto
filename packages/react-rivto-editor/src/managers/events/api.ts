import type { PanelEventScope } from "../../panels/types";
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
  /**
   * Checks whether this panel's registration was captured for a native event.
   *
   * @param id - Local registration identifier.
   * @param event - Native event whose registration snapshot is inspected.
   * @returns Whether the captured registration is still active.
   */
  has(id: string, event: Event): boolean;
}

/** Shared document registrations, optionally restricted to a single panel. */
export interface DocumentEventsApi extends PanelEventsApi {
  /**
   * Installs a handler for the document or for the specified panel occurrence.
   *
   * With an owner, dispatch checks its current root and qualifies the definition ID
   * with the panel ID. The panel retains the returned disposer for its own cleanup.
   *
   * @param definition - Native event, filters, listener options and registration ID.
   * @param listener - Handler returning true to claim an event.
   * @param owner - Optional occurrence restricting the handler to one mounted root.
   * @returns Idempotent disposer for the active registration.
   * @throws If the ID is empty or duplicated, attachment fails, or the runtime is inactive.
   */
  register<
    Target extends DOMEventTarget = "surface",
    Type extends DOMEventName<Target> = DOMEventName<Target>,
  >(
    definition: DOMEventDefinition<Target, Type>,
    listener: EditorEventHandler<EditorEvent<Target, Type>>,
    owner?: PanelEventScope,
  ): () => void;
}
