import type { PanelEventsApi } from "./api";
import type { PanelRegistry } from "./panel-registry";
import type { EventManager } from "./event-manager";
import type { PanelRegistration } from "./types";
import type { ReactPanelApi } from "../../panels/types";

/** Local operations over the document's shared registrations. */
export class PanelEventManager implements PanelEventsApi {
  /**
   * Binds event registrations and DOM operations to one mounted occurrence.
   * Shared listener state stays on the supplied document manager; the panel owns local disposers.
   * @param shared - Document event registrations and native listener transport.
   * @param owner - Stable occurrence identity, current DOM root, and registration cleanup.
   * @param panels - Mounted roots and their rendered surface kinds.
   * @returns Event methods that retain this panel even when another panel gains focus.
   */
  constructor(
    private readonly shared: EventManager,
    private readonly owner: PanelRegistration & Pick<ReactPanelApi, "mode">,
    private readonly panels: PanelRegistry,
  ) {}
  /**
   * Registers a DOM event handler scoped to this panel and owned by its cleanup lifecycle.
   *
   * @param definition - Registration definition with its stable ID, filters, and options.
   * @param listener - Panel-scoped DOM event handler; a truthy result claims the event.
   * @returns A function that unregisters the handler.
   * @throws If the panel registration ID is invalid or already registered, or ownership is inactive.
   */
  register: PanelEventsApi["register"] = (definition, listener) =>
    this.owner.registerCleanup(this.shared.register(definition, listener, this.owner));
  /**
   * Deletes a DOM event registration using this panel's ID namespace.
   *
   * @param id - Stable ID of the record or registration to access.
   * @returns Whether the registration was removed.
   */
  delete(id: string): boolean {
    return this.shared.delete(`${this.owner.id}:${id}`);
  }
  /**
   * Reads this panel's mounted surface root.
   *
   * @returns Root element, or null when unmounted.
   */
  getRoot(): HTMLElement | null {
    return this.owner.getRoot();
  }
  /**
   * Publishes this panel's current root element, or clears it on unmount.
   *
   * @param root - Mounted surface root, or null when clearing its registration.
   */
  setRoot(root: HTMLElement | null): void {
    this.owner.setRoot(root);
  }
  /**
   * Reads the mounted surface's mode, falling back to the panel's declared mode.
   *
   * @returns Current block or edgeless surface type.
   */
  getSurfaceType() {
    return this.getRoot() ? this.panels.getSurfaceType(this.getRoot()) : this.owner.mode.get();
  }
}
