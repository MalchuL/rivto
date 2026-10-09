/** React block containment lookup used by page drop resolvers. */
import { getBlockContainment } from "../../../managers/blocks/types";
import type { EditorViewApi } from "../../../types";

/**
 * Reads React containment metadata for one placed block.
 *
 * @param editorView - Editor view owning the registered block definitions.
 * @param blockId - Placed block whose parent-side policy is requested.
 * @returns Registered containment, or `undefined` when unconstrained.
 */
export function blockContainment(editorView: EditorViewApi, blockId: string) {
  const type = editorView.blocks.getBlockNode(blockId)?.type;
  return type ? getBlockContainment(editorView.blockTypes.getDefinition(type)) : undefined;
}
