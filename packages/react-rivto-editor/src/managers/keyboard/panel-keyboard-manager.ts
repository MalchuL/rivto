import type { PanelRegistration } from "../../panels/types";
import type { KeyboardApi } from "./keyboard-api";
import type { KeyboardManager } from "./keyboard-manager";

/** Local operations over the document's shared registrations. */
export class PanelKeyboardManager implements KeyboardApi {
  /**
   * Binds registrations to a panel while keeping keymap settings shared by the document.
   *
   * The borrowed shared capability excludes attachment and runtime teardown.
   * Local registration methods explicitly delegate shared keymap operations.
   *
   * @param shared - Document keyboard registrations and shared keymap settings.
   * @param owner - Occurrence that owns local registration IDs and cleanup.
   */
  constructor(
    private readonly shared: Pick<KeyboardManager, keyof KeyboardApi>,
    private readonly owner: PanelRegistration,
  ) {}
  /**
   * Registers a keyboard handler in this panel's namespace and cleanup lifecycle.
   *
   * @param definition - Registration definition with its stable ID, filters, and options.
   * @param listener - Panel-scoped keyboard handler; a truthy result consumes the shortcut.
   * @returns A function that unregisters the handler.
   * @throws If the definition is invalid, its ID is duplicated, or ownership is inactive.
   */
  register: KeyboardApi["register"] = (definition, listener) =>
    this.owner.registerCleanup(this.shared.register(definition, listener, this.owner));
  /**
   * Deletes a keyboard registration in this panel's namespace.
   *
   * @param id - Stable ID of the record or registration to access.
   * @returns Whether the registration was removed.
   */
  delete(id: string): boolean {
    return this.shared.delete(`${this.owner.id}:${id}`);
  }
  /**
   * Reads registered keyboard command definitions from the shared runtime.
   *
   * @returns The shared command list.
   */
  list() {
    return this.shared.list();
  }
  /**
   * Reads the shared keyboard runtime's observable revision.
   *
   * @returns Current revision number.
   */
  get revision() {
    return this.shared.revision;
  }
  /**
   * Observes changes to the shared keyboard command registry.
   *
   * @param listener - Callback invoked when the observed state changes.
   * @returns A function that removes the listener.
   */
  subscribe: KeyboardApi["subscribe"] = (listener) => this.shared.subscribe(listener);
  /**
   * Replaces the shared runtime's complete shortcut override map.
   *
   * @param keymap - Complete shortcut override map keyed by command ID.
   * @throws If the replacement keymap or a shortcut is invalid.
   */
  replaceKeymap: KeyboardApi["replaceKeymap"] = (keymap) => this.shared.replaceKeymap(keymap);
  /**
   * Updates a shared command's shortcut override, using undefined to restore its defaults.
   *
   * @param id - Shared keyboard command ID whose bindings are overridden.
   * @param keys - Shortcut strings; an empty list disables bindings and undefined restores registered defaults.
   * @throws If the ID or shortcut strings are invalid.
   */
  setKeymapOverride: KeyboardApi["setKeymapOverride"] = (id, keys) =>
    this.shared.setKeymapOverride(id, keys);
}
