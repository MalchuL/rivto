import type { EditorMode } from "@chulane/rivto";
import type { DOMEventDefinition, DOMEventName, DOMEventTarget } from "./dom-types";
import type { EditorEvent } from "./editor-event";
import type { EditorEventHandler } from "./types";

/** Event registrations and DOM root access for one EditorPanel. */
export interface PanelEventsApi {
  /**
   * Registers a handler restricted to this panel, with automatic panel cleanup.
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
   * Updates the DOM root used for events, selection, and panel registration.
   * Called by the surface ref when React attaches, replaces, or removes its element.
   * @param root - Current surface element, or null when detached.
   */
  setRoot(root: HTMLElement | null): void;
  /** @returns This panel’s DOM root, or null when no root is attached or the panel is disabled. */
  getRoot(): HTMLElement | null;
  /**
   * Reads the rendered surface of this panel without changing shared document mode.
   * Unlike `reactEditor.mode.get()`, which is shared by a document's panels, this
   * describes the receiving DOM surface: a page embedding returns `block` even
   * when its document's core mode is `edgeless`. No additional mode is stored.
   * Event dispatch captures this value in `event.mode`; handlers should use that
   * snapshot. Use this method for panel-specific commands outside event handlers,
   * and the core mode manager for document-wide presentation choices.
   * @returns Mounted panel's surface type, or core mode when no recognized surface is mounted.
   */
  getSurfaceType(): EditorMode;
}
