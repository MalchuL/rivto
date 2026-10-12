import type { ViewEventsApi } from "./api";
import type { PanelRegistry } from "./panel-registry";
import type { EventManager } from "./event-manager";
import type { DocumentViewScope } from "./types";

/** Local operations over the document's shared registrations. */
export class ViewEventManager implements ViewEventsApi {
  /**
   * Binds event registrations and DOM operations to one mounted occurrence.
   * Shared listener state stays on the supplied document manager; the view owns local disposers.
   * @param shared - Document event registrations and native listener transport.
   * @param owner - Stable occurrence identity, current DOM root, and registration cleanup.
   * @param views - Mounted roots and their rendered surface kinds.
   * @returns Event methods that retain this view even when another view gains focus.
   */
  constructor(private readonly shared: EventManager, private readonly owner: DocumentViewScope & Pick<import("../../panels/types").PanelAPI, "mode">, private readonly views: PanelRegistry) {}
  register: ViewEventsApi["register"] = (definition, listener) => this.owner.own(this.shared.register(definition, listener, this.owner));
  delete(id: string): boolean { return this.shared.delete(`${this.owner.id}:${id}`); }
  getRoot(): HTMLElement | null { return this.owner.getRoot(); }
  setRoot(root: HTMLElement | null): void { this.owner.setRoot(root); }
  getSurfaceType() { return this.getRoot() ? this.views.getSurfaceType(this.getRoot()) : this.owner.mode.get(); }
}
