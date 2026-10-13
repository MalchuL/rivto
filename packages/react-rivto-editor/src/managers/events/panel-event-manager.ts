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
  constructor(private readonly shared: EventManager, private readonly owner: PanelRegistration & Pick<ReactPanelApi, "mode">, private readonly panels: PanelRegistry) {}
  register: PanelEventsApi["register"] = (definition, listener) => this.owner.registerCleanup(this.shared.register(definition, listener, this.owner));
  delete(id: string): boolean { return this.shared.delete(`${this.owner.id}:${id}`); }
  getRoot(): HTMLElement | null { return this.owner.getRoot(); }
  setRoot(root: HTMLElement | null): void { this.owner.setRoot(root); }
  getSurfaceType() { return this.getRoot() ? this.panels.getSurfaceType(this.getRoot()) : this.owner.mode.get(); }
}
