import type { KeyboardApi } from "./keyboard-api";
import type { DocumentViewScope } from "../events/document-view";
import type { KeyboardManager } from "./keyboard-manager";

/** Local operations over the document's shared registrations. */
export class ViewKeyboardManager implements KeyboardApi {
  /**
   * Binds registrations to a view while keeping keymap settings shared by the document.
   * @param shared - Document keyboard registrations and shared keymap settings.
   * @param owner - Occurrence that owns local registration IDs and cleanup.
   * @returns Local registration methods and explicitly delegated shared keymap methods.
   */
  constructor(private readonly shared: KeyboardManager, private readonly owner: DocumentViewScope) {}
  register: KeyboardApi["register"] = (definition, listener) => this.owner.own(this.shared.register(definition, listener, this.owner));
  delete(id: string): boolean { return this.shared.delete(`${this.owner.id}:${id}`); }
  list() { return this.shared.list(); }
  get revision() { return this.shared.revision; }
  subscribe: KeyboardApi["subscribe"] = (listener) => this.shared.subscribe(listener);
  replaceKeymap: KeyboardApi["replaceKeymap"] = (keymap) => this.shared.replaceKeymap(keymap);
  setKeymapOverride: KeyboardApi["setKeymapOverride"] = (id, keys) => this.shared.setKeymapOverride(id, keys);
}
