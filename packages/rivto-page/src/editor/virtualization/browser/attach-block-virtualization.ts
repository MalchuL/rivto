import { getBrowserElementIdentity } from "@chulane/rivto-root/browser";
import type { BlockVirtualizationController } from "../block-virtualization-controller";
import type { BlockVirtualizationRegistry } from "../block-virtualization-registry";

/**
 * Attaches a virtualized view to the mounted occurrence and its document geometry.
 *
 * The view owns the registration until the returned disposer runs. Geometry
 * observation starts when its exact Root binds and ends when it unbinds. Root
 * and host elements remain within this browser boundary; the registration
 * retains only their opaque identities.
 *
 * @param host - Mounted flow container inside the editor occurrence.
 * @param onMargin - Receives the container's document offset in CSS pixels.
 * @param registry - Editor-owned registration capability for the mounted view.
 * @param controller - View policy that owns registration and observer cleanup.
 * @returns Idempotent disposer releasing this view's resources.
 * @throws If outside an editor, attachment is already active, or setup and rollback fail.
 */
export function attachBlockVirtualization(
  host: HTMLElement,
  onMargin: (offset: number) => void,
  registry: Pick<BlockVirtualizationRegistry, "register">,
  controller: Pick<BlockVirtualizationController, "attach">,
): () => void {
  const root = host.closest<HTMLElement>("[data-rivto-block-editor]");
  if (!root) {
    throw new Error("Virtualization requires a BlockEditor root");
  }
  const hostIdentity = getBrowserElementIdentity(host);
  return controller.attach(
    getBrowserElementIdentity(root),
    (occurrence) => {
      const region = occurrence.captureRegionByIdentity(hostIdentity);
      return region?.observeDocumentOffsetAndFollowEnd(onMargin) ?? (() => {});
    },
    registry,
  );
}
