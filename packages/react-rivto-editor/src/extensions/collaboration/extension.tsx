import { z } from "zod";
import type { ReactEditorExtension } from "../../managers";
import { CollaborationOverlay } from "./overlay";
import type { CollaborationUser } from "@chulane/rivto";
import type { PresenceOwner } from "./publish";

export type { CollaborationUser } from "@chulane/rivto";

/**
 * Adds transient collaborative pointers and selections to document and edgeless panels.
 *
 * Providers remain host-owned. Presence uses the document's collaboration channel,
 * never document snapshots or history. User identity is display metadata, not authentication.
 * Timing options are captured when this extension is created and never published as presence.
 * Setup registers one human participant; blur or panel cleanup affects only that participant.
 * Other local participants are rendered alongside remote participants and keep their own lifecycle.
 *
 * @param options - Required host-owned identity shared by this runtime's panels.
 * @param options.user - User ID, name, and six-digit hex color; sessions have separate client IDs.
 * @param options.pointerThrottleMs - Pointer publication interval in milliseconds, from 0 to 2147483647; defaults to 50. Zero coalesces events until the next timer task.
 * @param options.pointerSmoothingMs - Finite nonnegative EMA time constant in milliseconds; defaults to 20. Zero disables smoothing. Applies to incoming pointers in this runtime.
 * @returns Opt-in extension registering panel-local capture and remote overlays.
 * @throws If pointer timing is invalid. Display identity is validated when the extension is installed.
 */
export function collaborationExtension(options: {
  readonly user: CollaborationUser;
  readonly pointerThrottleMs?: number;
  readonly pointerSmoothingMs?: number;
}): ReactEditorExtension {
  const user = { ...options.user };
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
     * @returns Cleanup disposing only the human registration and removing the mounted component.
     * @throws If display identity is invalid or participant registration or component mounting fails.
     */
    setup(editor) {
      const owner: PresenceOwner = {
        participant: editor.collaboration.registerParticipant({ id: crypto.randomUUID(), user }),
      };
      let unmount: () => void;
      try {
        unmount = editor.extensions.mount(() => (
          <CollaborationOverlay
            owner={owner}
            pointerThrottleMs={pointerThrottleMs}
            pointerSmoothingMs={pointerSmoothingMs}
          />
        ));
      } catch (error) {
        // Failed UI setup must not leave a registered human in the headless session.
        owner.participant.dispose();
        throw error;
      }
      return () => {
        owner.panel = undefined;
        try {
          owner.participant.dispose();
        } finally {
          unmount();
        }
      };
    },
  };
}
