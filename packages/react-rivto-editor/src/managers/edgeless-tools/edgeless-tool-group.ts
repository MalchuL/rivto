import { CanvasToolGroup } from "@chulane/rivto-edgeless";
import type { EdgelessToolbarGroup } from "../edgeless-toolbar/types";
import type { EdgelessCreationDefaults } from "../elements/edgeless-creation-defaults";
import type { ElementCreationDefaults } from "../elements/creation-defaults-types";

/** Surface-local access to a registered group's shared settings; never copies its storage. */
export class EdgelessToolGroup extends CanvasToolGroup<
  ElementCreationDefaults,
  EdgelessToolbarGroup
> {
  /**
   * Binds a group to the surface's existing settings coordinator.
   *
   * @param registration - Immutable group description owned by the editor registry.
   * @param defaults - The same coordinator used by type edits and creation.
   */
  constructor(registration: EdgelessToolbarGroup, defaults: EdgelessCreationDefaults) {
    super(registration, {
      /**
       * Resolves the group's initial and remembered settings.
       *
       * @returns Detached settings without type-local overrides.
       */
      get: () => defaults.get({ group: registration.id }),
      /**
       * Changes declared settings through the group's registered policy.
       *
       * @param patch - Properties or dimensions to change.
       * @returns Publishes a successful settings change to the shared surface.
       * @throws If the policy rejects the fields or values.
       */
      set: (patch) => defaults.set({ group: registration.id }, patch),
    });
  }
}
