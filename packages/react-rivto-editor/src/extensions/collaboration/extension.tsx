import { z } from "zod";
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
 * Timing options are captured when this extension is created and never published as presence.
 *
 * @param options - Required host-owned identity shared by this runtime's panels.
 * @param options.user - User ID, name, and six-digit hex color; sessions have separate client IDs.
 * @param options.pointerThrottleMs - Pointer publication interval in milliseconds, from 0 to 2147483647; defaults to 50. Zero coalesces events until the next timer task.
 * @param options.pointerSmoothingMs - Finite nonnegative EMA time constant in milliseconds; defaults to 20. Zero disables smoothing. Applies to incoming pointers in this runtime.
 * @returns Opt-in extension registering panel-local capture and remote overlays.
 * @throws If the supplied display identity or pointer timing is invalid.
 */
export function collaborationExtension(options: {
  readonly user: CollaborationUser;
  readonly pointerThrottleMs?: number;
  readonly pointerSmoothingMs?: number;
}): ReactEditorExtension {
  const user = presenceSchema.shape.user.parse(options.user);
  const pointerThrottleMs = z
    .number()
    .min(0)
    .max(2_147_483_647)
    .default(50)
    .parse(options.pointerThrottleMs);
  const pointerSmoothingMs = z
    .number()
    .finite()
    .nonnegative()
    .default(20)
    .parse(options.pointerSmoothingMs);
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
        <CollaborationOverlay
          user={user}
          owner={owner}
          pointerThrottleMs={pointerThrottleMs}
          pointerSmoothingMs={pointerSmoothingMs}
        />
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
