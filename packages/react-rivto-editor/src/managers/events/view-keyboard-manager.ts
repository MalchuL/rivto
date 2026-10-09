import type { KeyboardCapability } from "../../capabilities";
import type { DocumentViewScope } from "./document-view";
import type { KeyboardManager } from "./keyboard-manager";

/** Local operations over the document's shared registrations. */
export class ViewKeyboardManager implements KeyboardCapability {
  /**
   * Binds registrations to a view while keeping keymap settings shared by the document.
   * @param shared - Document keyboard registrations and shared keymap settings.
   * @param owner - Occurrence that owns local registration IDs and cleanup.
   * @returns Local registration methods and explicitly delegated shared keymap methods.
   */
  constructor(private readonly shared: KeyboardManager, private readonly owner: DocumentViewScope) {}
  register: KeyboardCapability["register"] = (definition, listener) => this.owner.own(this.shared.register(definition, listener, this.owner));
  delete(id: string): boolean { return this.shared.delete(`${this.owner.id}:${id}`); }
  list() { return this.shared.list(); }
  get revision() { return this.shared.revision; }
  subscribe: KeyboardCapability["subscribe"] = (listener) => this.shared.subscribe(listener);
  replaceKeymap: KeyboardCapability["replaceKeymap"] = (keymap) => this.shared.replaceKeymap(keymap);
  setKeymapOverride: KeyboardCapability["setKeymapOverride"] = (id, keys) => this.shared.setKeymapOverride(id, keys);
}
