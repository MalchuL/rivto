import { EdgelessCreationTool } from "../edgeless-tools/edgeless-creation-tool";
import type { ReactEditorApi } from "../../editor/types";
import type { RegistrationOwner } from "../extensions/types";
import type { ElementTypesApi, ReactElementRegistration } from "./types";
import { RevisionStore } from "../../internal-store";

/**
 * Installs document definitions and React presentation as one disposable registration.
 *
 * Each persisted type has at most one React registration. Definitions, optional
 * resize behavior, toolbar creation tools, and clipboard conversion are installed together; failed
 * installation rolls back completed registrations. The extension owner releases
 * successful registrations when its lifecycle ends.
 */
export class ElementTypeManager implements ElementTypesApi {
  private readonly entries = new Map<string, ReactElementRegistration>();
  private readonly store = new RevisionStore();
  /**
   * Creates a registry whose subscriptions and registrations follow the extension owner.
   *
   * @param editor - Shared document and clipboard infrastructure.
   * @param owner - Extension lifecycle and destruction guard.
   */
  constructor(
    private readonly editor: ReactEditorApi,
    private readonly owner: RegistrationOwner,
  ) {
    owner.registerCleanup(() => this.store.clear());
  }
  /**
   * Installs a type's definition, presentation, optional toolbar tool and clipboard converter.
   *
   * Addition and removal notify registry subscribers. Removal also switches the
   * tool to selection in subscribed panels that were creating this type; persisted elements remain.
   * A creation contribution installs tool ID `element:${type}`; its group must be registered
   * separately. A supplied behavior.resize overrides definition.resize for core registration.
   *
   * @param registration - Definition and presentation for a unique type.
   * @returns Idempotent disposer, also owned by the extension lifecycle.
   * @throws If the owner is inactive, the type conflicts, or installation fails;
   * completed parts are rolled back on installation failure.
   */
  register(registration: ReactElementRegistration): () => void {
    this.owner.assertActive();
    const type = registration.definition.type;
    if (this.entries.has(type)) {
      throw new Error(`Element renderer ${type} is already registered`);
    }
    const disposers: Array<() => void> = [];
    try {
      disposers.push(
        this.editor.elementRegistry.register({
          ...registration.definition,
          ...(registration.behavior?.resize ? { resize: registration.behavior.resize } : {}),
        }),
      );
      if (registration.creation) {
        const creation = registration.creation;
        disposers.push(
          this.editor.edgelessToolbar.registerTool({
            id: `element:${type}`,
            title: creation.title,
            icon: creation.icon,
            group: creation.group,
            order: creation.order,
            createTool: (options) =>
              new EdgelessCreationTool({
                ...options,
                type,
                create: () => creation.create(options.reactPanel),
              }),
          }),
        );
      }
      if (registration.clipboard) {
        disposers.push(
          this.editor.clipboard.registerElementConverter(type, registration.clipboard),
        );
      }
    } catch (error) {
      disposers.reverse().forEach((dispose) => dispose());
      throw error;
    }
    this.entries.set(type, registration);
    this.store.changed();
    return this.owner.registerCleanup(() => {
      if (this.entries.get(type) !== registration) {
        return;
      }
      this.entries.delete(type);
      disposers.reverse().forEach((dispose) => dispose());
      this.store.changed();
    });
  }
  /**
   * Looks up the installed React registration without copying it.
   *
   * @param type - Persisted type.
   * @returns Registration, or undefined for an unknown type.
   */
  get(type: string): ReactElementRegistration | undefined {
    return this.entries.get(type);
  }
  /**
   * Lists installed registrations in insertion order.
   *
   * @returns Registrations in installation order, in an array detached from the
   * registry. Individual registration objects are shared with the registry.
   */
  getAll(): readonly ReactElementRegistration[] {
    return [...this.entries.values()];
  }
  /**
   * Observes registry changes without an initial notification.
   *
   * @param listener - Called when a registration is added or removed.
   * @returns Unsubscribe callback.
   */
  subscribe(listener: () => void): () => void {
    return this.store.subscribe(listener);
  }
  /**
   * Reads the current registration revision for external-store subscriptions.
   *
   * @returns Version token that changes when registrations are added or removed.
   */
  get revision(): number {
    return this.store.revision;
  }
}
