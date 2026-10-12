/** React block containment lookup used by page drop resolvers. */
import type { PanelAPI } from "../../../panels/types";
import { getBlockContainment } from "../../../managers/blocks/types";

/**
 * Reads React containment metadata for one placed block.
 *
 * @param panel - Editor view owning the registered block definitions.
 * @param blockId - Placed block whose parent-side policy is requested.
 * @returns Registered containment, or `undefined` when unconstrained.
 */
export function blockContainment(panel: PanelAPI, blockId: string) {
  const type = panel.blocks.getBlockNode(blockId)?.type;
  return type ? getBlockContainment(panel.editor.blockTypes.getDefinition(type)) : undefined;
}
