/** React block containment lookup used by page drop resolvers. */
import type { EditorViewApi } from "../../../editor-view/types";
import { getBlockContainment } from "../../../managers/blocks/types";

/**
 * Reads React containment metadata for one placed block.
 *
 * @param editorView - Editor view owning the registered block definitions.
 * @param blockId - Placed block whose parent-side policy is requested.
 * @returns Registered containment, or `undefined` when unconstrained.
 */
export function blockContainment(editorView: EditorViewApi, blockId: string) {
  const type = editorView.runtime.blocks.getBlockNode(blockId)?.type;
  return type ? getBlockContainment(editorView.runtime.blockTypes.getDefinition(type)) : undefined;
}
