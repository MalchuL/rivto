import { useContext, useMemo, type ForwardedRef } from "react";
import type { RegionIdentity } from "@chulane/rivto-root";
import { BlockEditorContext } from "../block-editor/block-editor-context";
import type { BlockLayoutRegion, BlockLayoutRegions } from "./block-layout-regions";
import { BlockRegionRef } from "./browser/block-region-ref";
import { createBlockLayoutInputRef } from "./browser/use-block-layout-input-ref";
import type { BlockLayoutInputBinding } from "./types";
import type { BlockRegionEventsApi } from "../../../editor/events/types";

/**
 * Binds a primitive's DOM lifetime to its editor-owned region registration.
 *
 * React releases the registration and forwarded ref on replacement or unmount.
 * The callback remains stable across selection and own-node content updates.
 *
 * @param blockId - Owner identity within the current occurrence.
 * @param role - Layout role independent of DOM nesting.
 * @param forwarded - Optional caller identity ref, retaining its cleanup contract.
 * @param bindInput - Optional normalized input registration for this mounted region.
 * @returns Commit ref registering the element and releasing it on unmount.
 * @throws If outside BlockEditor, or region registration, input binding, ref forwarding, or cleanup fails.
 */
export function useBlockRegion(
  blockId: string,
  role: BlockLayoutRegion,
  forwarded?: ForwardedRef<RegionIdentity>,
  bindInput?: BlockLayoutInputBinding,
) {
  const editor = useContext(BlockEditorContext);
  if (!editor) {
    throw new Error("Block editor hooks require a BlockEditor");
  }
  const regions: Pick<BlockLayoutRegions, "register"> = editor.regions;
  const events: Pick<BlockRegionEventsApi, "observeRegion"> = editor.events;
  return useMemo(() => {
    const mount = new BlockRegionRef(regions, blockId, role, forwarded).commit;
    return bindInput ? createBlockLayoutInputRef(mount, events, bindInput) : mount;
  }, [regions, events, blockId, role, forwarded, bindInput]);
}
