import { BlockSlotHost } from "../../slots/block-slots";
import { useBlockLayoutState } from "./block-layout-context";

/**
 * Places body contributions wherever the owning layout mounts this primitive.
 *
 * Body contributions remain independent of the child subtree's collapse state.
 *
 * @returns The populated body host, or null when no contribution matches.
 * @throws If outside a block layout or a predicate/contribution fails.
 */
export function BlockBody() {
  return <BlockSlotHost {...useBlockLayoutState()} position="body" />;
}
