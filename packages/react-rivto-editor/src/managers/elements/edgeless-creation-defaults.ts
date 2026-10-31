import type { ReactEditorApi } from "../../editor/types";
import type { ReactElementRegistration } from "./types";
import type { EdgelessToolbarGroup } from "../edgeless-toolbar/types";
import { RevisionStore } from "../../internal-store";
import { CreationDefaultsStore } from "./creation-defaults-store";
import type { CreationDefaultsScope, ElementCreationDefaults } from "./creation-defaults-types";

/**
 * Owns registration-scoped creation settings for one mounted edgeless representation.
 *
 * Registrations supply initial defaults and a policy listing fields to remember.
 * Committed edits update session-local stores, while property previews temporarily
 * affect tool controls only. These stores do not persist settings in the document.
 * A creation request can still override the resolved settings with explicit properties.
 */
export class EdgelessCreationDefaults {
  private readonly stores = new WeakMap<
    ReactElementRegistration | EdgelessToolbarGroup,
    CreationDefaultsStore
  >();
  private readonly previews = new Map<EdgelessToolbarGroup, CreationDefaultsStore>();
  private readonly changes = new RevisionStore();

  /**
   * Creates an isolated session without subscriptions or changes to registrations.
   *
   * @param editor - Editor supplying live type and toolbar-group registrations.
   */
  constructor(private readonly editor: ReactEditorApi) {}

  /**
   * Subscribes to settings and displayed preview changes, including commits affecting both scopes.
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
   * Type settings merge definition defaults, type memory and then group settings,
   * with later values winning. Group settings combine the group's initial defaults
   * with its remembered values, which take precedence. Explicit creation properties
   * are applied later by the creation operation.
   * Replacing a registration starts fresh memory for that registration identity.
   * For example, a text type can contribute its own defaults while its toolbar
   * group shares remembered font settings between tools in that group. Returned
   * objects are copies, so changing them does not change the session.
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
      // Start with the group's registered values, then overlay changes made in this session.
      const current = this.store(group).getSnapshot();
      return structuredClone({
        props: { ...group.creationDefaults?.props, ...current.props },
        frame: { ...group.creationDefaults?.frame, ...current.frame },
      });
    }
    const registration = this.registration(scope.type);
    const current = this.store(registration).getSnapshot();
    // A behavior may choose its settings group independently of the creation toolbar.
    const groupId = registration.behavior?.defaultsGroup ?? registration.creation?.group;
    const group = groupId ? this.get({ group: groupId }) : {};
    return structuredClone({
      props: { ...registration.definition.defaults, ...current.props, ...group.props },
      frame: { ...current.frame, ...group.frame },
    });
  }

  /**
   * Resolves settings for tool controls, including uncommitted property edits.
   *
   * Creation continues to read get(), so a preview never changes remembered defaults.
   * Only fields declared by the matching registration's remembering policy are shown.
   * This lets controls reflect a property editor's pending changes without making
   * those changes the defaults for an element created during the preview.
   *
   * @param groupId - Registered group whose controls are being rendered.
   * @returns Detached settings with the current preview overlaid, or ordinary defaults when absent.
   */
  getGroupPreview(groupId: string): ElementCreationDefaults {
    const settings = this.get({ group: groupId });
    const registration = this.editor.edgelessToolbar.getGroup(groupId);
    // Overlay only the temporary properties; frame settings remain the committed values.
    const preview = registration && this.previews.get(registration)?.getSnapshot();
    return { ...settings, props: { ...settings.props, ...preview?.props } };
  }

  /**
   * Overlays validated property edits in tool controls without remembering them.
   *
   * Successive patches accumulate until the owning property interaction commits or cancels.
   * Document validation belongs to the caller; undeclared fields are ignored here.
   * Types without a registered settings group have no tool controls to update and
   * are ignored. This method neither changes the document nor remembers an edit.
   *
   * @param type - Registered element type being previewed.
   * @param props - Validated changed properties from the current interaction.
   * @returns Notifies settings observers once when a displayed field changes.
   */
  setGroupPropertyPreview(type: string, props: Record<string, unknown>): void {
    const registration = this.editor.elementTypes.get(type);
    if (!registration) {
      return;
    }
    const groupId = registration.behavior?.defaultsGroup ?? registration.creation?.group;
    const group = groupId ? this.editor.edgelessToolbar.getGroup(groupId) : undefined;
    if (!group) {
      return;
    }
    // Filter through the group policy so controls only preview settings they own.
    const store = this.previews.get(group) ?? new CreationDefaultsStore();
    if (store.apply(store.prepare({ props }, group.rememberedProperties))) {
      this.previews.set(group, store);
      this.changes.changed();
    }
  }

  /**
   * Removes the property interaction's display overrides from tool controls.
   *
   * The remembered values remain intact and become visible again through
   * getGroupPreview. Clearing an empty preview does not notify subscribers.
   *
   * @returns Restores remembered settings and notifies observers when overrides existed.
   */
  clearGroupPropertyPreviews(): void {
    if (this.previews.size) {
      this.previews.clear();
      this.changes.changed();
    }
  }

  /**
   * Changes explicit settings after checking its registered settings policy.
   *
   * Settings commands reject undeclared fields. Validation precedes all writes;
   * group changes never modify existing document elements or registered defaults.
   * Use this for a direct tool-settings change, such as choosing a default font,
   * rather than for recording the result of a document edit.
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
    // Strict preparation rejects fields the selected type or group does not expose.
    const prepared = store.prepare(patch, registration.rememberedProperties, true);
    // Validate the complete resolved properties with the proposed changes applied.
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
   * Each registration chooses which fields to retain; other fields, such as
   * authored text when excluded by the policy, do not become creation settings.
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
    // Type and group policies can remember different subsets of the same edit.
    const prepared = targets.map((target) => ({
      store: this.store(target),
      patch: this.store(target).prepare(patch, target.rememberedProperties),
    }));
    // Prepare both patches before applying either, then notify once for the whole update.
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
   * The weak map keeps settings separate even if a registration is replaced with
   * another registration using the same ID. It also avoids keeping removed
   * registrations alive solely because they once had settings.
   *
   * @param registration - Live type or group registration; never mutated.
   * @returns Its session-local store, eligible for collection when the registration is removed.
   */
  private store(
    registration: ReactElementRegistration | EdgelessToolbarGroup,
  ): CreationDefaultsStore {
    let store = this.stores.get(registration);
    if (!store) {
      store = new CreationDefaultsStore();
      this.stores.set(registration, store);
    }
    return store;
  }
}
