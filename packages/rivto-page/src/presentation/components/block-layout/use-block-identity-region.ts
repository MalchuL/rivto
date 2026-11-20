import { useContext, useMemo } from "react";
import type { RegionIdentity } from "@chulane/rivto-root";
import { BlockEditorContext } from "../block-editor/block-editor-context";
import type { BlockLayoutRegion, BlockLayoutRegions } from "./block-layout-regions";

/**
 * Registers one mounted layout identity without borrowing a browser element.
 *
 * Replacement or unmount releases the preceding registration before installing
 * the new one. Stale registry disposers cannot remove a newer registration.
 *
 * @param blockId - Owner identity within the current occurrence.
 * @param role - Layout role independent of DOM nesting.
 * @returns Callback registering an opaque identity and releasing it on unmount.
 * @throws If outside BlockEditor or registration or cleanup fails.
 */
export function useBlockIdentityRegion(
  blockId: string,
  role: BlockLayoutRegion,
): (identity: RegionIdentity | null) => void {
  const editor = useContext(BlockEditorContext);
  if (!editor) {
    throw new Error("Block editor hooks require a BlockEditor");
  }
  const regions: Pick<BlockLayoutRegions, "register"> = editor.regions;
  return useMemo(() => {
    let release: (() => void) | undefined;
    return (identity) => {
      const previous = release;
      release = undefined;
      previous?.();
      if (identity) {
        release = regions.register(blockId, role, identity);
      }
    };
  }, [regions, blockId, role]);
}
