import type { EdgelessToolbarGroup } from "../edgeless-toolbar/types";
import type { EdgelessCreationDefaults } from "../elements/edgeless-creation-defaults";
import type { ElementCreationDefaults } from "../elements/creation-defaults-types";

/** Surface-local access to a registered group's shared settings; never copies its storage. */
export class EdgelessToolGroup {
  /**
   * Binds a group to the surface's existing settings coordinator.
   *
   * @param registration - Immutable group description owned by the editor registry.
   * @param defaults - The same coordinator used by type edits and creation.
   */
  constructor(
    readonly registration: EdgelessToolbarGroup,
    private readonly defaults: EdgelessCreationDefaults,
  ) {}

  /**
   * Resolves the group's initial and remembered settings.
   *
   * @returns Detached settings without type-local overrides.
   */
  getSettings(): ElementCreationDefaults {
    return this.defaults.get({ group: this.registration.id });
  }

  /**
   * Changes declared settings through the group's registered policy.
   *
   * @param patch - Properties or dimensions to change.
   * @returns Publishes a successful settings change to the shared surface.
   * @throws If the policy rejects the fields or values.
   */
  setSettings(patch: ElementCreationDefaults): void {
    this.defaults.set({ group: this.registration.id }, patch);
  }
}
