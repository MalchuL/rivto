/** React block containment lookup used by page drop resolvers. */
import type { ReactPanelApi } from "../../../panels/types";
import { getBlockContainment } from "../../../managers/blocks/types";

/**
 * Reads React containment metadata for one placed block.
 *
 * @param reactPanel - Editor view owning the registered block definitions.
 * @param blockId - Placed block whose parent-side policy is requested.
 * @returns Registered containment, or `undefined` when unconstrained.
 */
export function blockContainment(reactPanel: ReactPanelApi, blockId: string) {
  const type = reactPanel.blocks.getBlockNode(blockId)?.type;
  return type ? getBlockContainment(reactPanel.editor.blockTypes.getDefinition(type)) : undefined;
}
