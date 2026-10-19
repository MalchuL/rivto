import type { ReactEditorApi } from "../../editor/types";
import type { ReactElementRegistration } from "./types";
import type { EdgelessToolbarGroup } from "../edgeless-toolbar/types";
import { RevisionStore } from "../../internal-store";
import { CreationDefaultsStore } from "./creation-defaults-store";
import type { CreationDefaultsScope, ElementCreationDefaults } from "./creation-defaults-types";

/** Owns registration-scoped creation settings for one mounted edgeless representation. */
export class EdgelessCreationDefaults {
  private readonly stores = new WeakMap<object, CreationDefaultsStore>();
  private readonly changes = new RevisionStore();

  /**
   * Creates an isolated session without subscriptions or changes to registrations.
   *
   * @param editor - Editor supplying live type and toolbar-group registrations.
   */
  constructor(private readonly editor: ReactEditorApi) {}

  /**
   * Subscribes to completed settings changes, including commits affecting both scopes.
   *
   * @param listener - Called once synchronously after each effective session update.
   * @returns A disposer removing this listener; registration changes have their own observers.
   */
  subscribe(listener: () => void): () => void {
    return this.changes.subscribe(listener);
  }

  /**
   * Resolves detached initial and current values for a type or group.
   *
   * Type settings merge definition defaults, type memory and then group settings.
   * Replacing a registration starts fresh memory for that registration identity.
   *
   * @param scope - Registered type or group to resolve.
   * @returns Detached properties and optional width/height; unresolved groups supply empty settings.
   * @throws If a requested type is not registered.
   */
  get(scope: CreationDefaultsScope): ElementCreationDefaults {
    if ("group" in scope) {
      const group = this.editor.edgelessToolbar.getGroup(scope.group);
      if (!group) {
        return {};
      }
      const current = this.store(group).getSnapshot();
      return structuredClone({
        props: { ...group.creationDefaults?.props, ...current.props },
        frame: { ...group.creationDefaults?.frame, ...current.frame },
      });
    }
    const registration = this.registration(scope.type);
    const current = this.store(registration).getSnapshot();
    const groupId = registration.behavior?.defaultsGroup ?? registration.creation?.group;
    const group = groupId ? this.get({ group: groupId }) : {};
    return structuredClone({
      props: { ...registration.definition.defaults, ...current.props, ...group.props },
      frame: { ...current.frame, ...group.frame },
    });
  }

  /**
   * Changes explicit settings after checking its registered settings policy.
   *
   * Settings commands reject undeclared fields. Validation precedes all writes;
   * group changes never modify existing document elements or registered defaults.
   *
   * @param scope - Type-local or group-local settings to change.
   * @param patch - Declared properties and positive dimensions to replace.
   * @returns Publishes the changed settings to this session's subscribers.
   * @throws If the scope is missing, fields are undeclared, or the settings policy rejects the values.
   */
  set(scope: CreationDefaultsScope, patch: ElementCreationDefaults): void {
    const registration =
      "type" in scope
        ? this.registration(scope.type)
        : this.editor.edgelessToolbar.getGroup(scope.group);
    if (!registration) {
      throw new Error("Creation defaults group is not registered");
    }
    const store = this.store(registration);
    const prepared = store.prepare(patch, registration.rememberedProperties, true);
    registration.rememberedProperties?.validate?.({
      ...this.get(scope).props,
      ...prepared.props,
    });
    if (store.apply(prepared)) {
      this.changes.changed();
    }
  }

  /**
   * Remembers declared fields from a successfully committed document action.
   *
   * Call with changed properties for edits and complete values for creation.
   * Missing registrations are ignored, so ordinary block transforms need no policy.
   * Previews, cancelled gestures and undo/redo must not call this method.
   *
   * @param type - Persisted type of the committed element.
   * @param patch - Successfully committed properties and frame dimensions.
   * @returns Updates type and group stores and publishes at most one session notification.
   */
  remember(type: string, patch: ElementCreationDefaults): void {
    const registration = this.editor.elementTypes.get(type);
    if (!registration) {
      return;
    }
    const groupId = registration.behavior?.defaultsGroup ?? registration.creation?.group;
    const group = groupId ? this.editor.edgelessToolbar.getGroup(groupId) : undefined;
    const targets: (ReactElementRegistration | EdgelessToolbarGroup)[] = [registration];
    if (group) {
      targets.push(group);
    }
    const prepared = targets.map((target) => ({
      store: this.store(target),
      patch: this.store(target).prepare(patch, target.rememberedProperties),
    }));
    let changed = false;
    for (const entry of prepared) {
      changed = entry.store.apply(entry.patch) || changed;
    }
    if (changed) {
      this.changes.changed();
    }
  }

  /**
   * Resolves a required live element registration.
   *
   * @param type - Persisted element type.
   * @returns The installed registration without copying it.
   * @throws If the type is not registered.
   */
  private registration(type: string): ReactElementRegistration {
    const registration = this.editor.elementTypes.get(type);
    if (!registration) {
      throw new Error(`Element type ${type} is not registered`);
    }
    return registration;
  }

  /**
   * Lazily allocates memory belonging to one registration identity.
   *
   * @param registration - Live type or group registration; never mutated.
   * @returns Its session-local store, eligible for collection when the registration is removed.
   */
  private store(registration: object): CreationDefaultsStore {
    let store = this.stores.get(registration);
    if (!store) {
      store = new CreationDefaultsStore();
      this.stores.set(registration, store);
    }
    return store;
  }
}
