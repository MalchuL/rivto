/** React block containment lookup used by page drop resolvers. */
import { getBlockContainment } from "../../../managers/blocks/types";
import type { ReactEditor } from "../../../types";

/**
 * Reads React containment metadata for one placed block.
 *
 * @param reactEditor - Runtime owning the registered block definitions.
 * @param blockId - Placed block whose parent-side policy is requested.
 * @returns Registered containment, or `undefined` when unconstrained.
 */
export function blockContainment(reactEditor: ReactEditor, blockId: string) {
  const type = reactEditor.blocks.getBlock(blockId)?.type;
  return type ? getBlockContainment(reactEditor.blockTypes.getDefinition(type)) : undefined;
}
