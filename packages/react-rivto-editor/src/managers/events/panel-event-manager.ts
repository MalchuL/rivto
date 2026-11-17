import type { DocumentEventsApi, PanelEventsApi } from "./api";
import type { PanelRegistration } from "../../panels/types";

/** Local operations over the document's shared registrations. */
export class PanelEventManager implements PanelEventsApi {
  /**
   * Binds event registrations to one mounted occurrence.
   *
   * Shared listener state stays on the supplied document manager; the panel owns local disposers.
   * Registrations retain this panel even when another panel gains focus.
   *
   * @param shared - Document event registrations and native listener transport.
   * @param owner - Stable occurrence identity, current DOM root, and registration cleanup.
   */
  constructor(
    private readonly shared: DocumentEventsApi,
    private readonly owner: PanelRegistration,
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
   * Checks this panel's registration in the native event's captured snapshot.
   *
   * @param id - Local registration identifier without the panel prefix.
   * @param event - Native event being dispatched.
   * @returns Whether the local registration is still active in that snapshot.
   */
  has(id: string, event: Event): boolean {
    return this.shared.has(`${this.owner.id}:${id}`, event);
  }
}
