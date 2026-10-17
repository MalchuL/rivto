import type { ReactEditorExtension } from "../../managers";
import { CollaborationOverlay } from "./overlay";
import { presenceSchema, type CollaborationUser } from "./state";
import type { PresenceOwner } from "./publish";

export type { CollaborationUser } from "./state";

/**
 * Adds transient collaborative pointers and selections to document and edgeless panels.
 *
 * Providers remain host-owned. Presence uses the document's collaboration channel,
 * never document snapshots or history. User identity is display metadata, not authentication.
 *
 * @param options - Required host-owned identity shared by this runtime's panels.
 * @param options.user - User ID, name, and six-digit hex color; sessions have separate client IDs.
 * @returns Opt-in extension registering panel-local capture and remote overlays.
 * @throws If the supplied display identity is invalid.
 */
export function collaborationExtension(options: {
  readonly user: CollaborationUser;
}): ReactEditorExtension {
  const user = presenceSchema.shape.user.parse(options.user);
  return {
    id: "collaboration",
    /**
     * Registers presence rendering with cleanup owned by the extension runtime.
     *
     * @param editor - Runtime whose panels share one publisher ownership record.
     * @returns Cleanup withdrawing presence and removing the mounted component.
     */
    setup(editor) {
      const owner: PresenceOwner = {};
      const unmount = editor.extensions.mount(() => (
        <CollaborationOverlay user={user} owner={owner} />
      ));
      return () => {
        if (owner.panel) {
          editor.getDocument().collaboration.setLocalState(null);
          owner.panel = undefined;
        }
        unmount();
      };
    },
  };
}
