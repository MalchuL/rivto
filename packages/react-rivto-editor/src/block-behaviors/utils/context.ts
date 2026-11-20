/**
 * Builds the snapshots behavior methods receive from page and outline callers.
 * Keyboard methods use attachment capabilities; outline methods use shallow block fields.
 *
 * @module
 */
import type { Selection } from "@chulane/rivto";
import type {
  BlockOutlinePanel,
  BlockOutlineContext,
  BlockSnapshotContext,
  BlockReadPanel,
} from "../types";

/**
 * Resolves shallow block fields and the current parent for an outline operation.
 *
 * The supplied selection is captured by the caller and preserved unchanged.
 * No DOM root or recursive subtree is read, including for parent interception.
 *
 * @param reactPanel - Live occurrence providing block fields and hierarchy.
 * @param blockId - Block to resolve, or undefined for an empty requested group.
 * @param selection - Selection captured for the complete operation, if any.
 * @returns Context for an existing block, or undefined for a missing identifier or block.
 */
export function createBlockOutlineContext(
  reactPanel: BlockOutlinePanel,
  blockId: string | undefined,
  selection: Selection | undefined,
): BlockOutlineContext | undefined {
  const block = blockId ? reactPanel.blocks.getBlockNode(blockId) : undefined;
  if (!block) {
    return undefined;
  }
  return {
    reactPanel,
    block,
    parentId: reactPanel.blocks.getParentId(block.id) ?? null,
    selection,
  };
}

/**
 * Resolves a full block snapshot and captured selection for a block behavior.
 *
 * @param reactPanel - Live occurrence supplying the block and parent hierarchy.
 * @param blockId - Placed block whose behavior will run.
 * @param selection - Portable selection captured for the operation, if any.
 * @returns Context for the block, or undefined when it is unplaced.
 * @throws Propagates block and parent lookup failures.
 */
export function createBlockSnapshotContext<Panel extends BlockReadPanel>(
  reactPanel: Panel,
  blockId: string,
  selection?: Selection,
): BlockSnapshotContext<Panel> | undefined {
  const block = reactPanel.blocks.getBlock(blockId);
  if (!block) {
    return undefined;
  }
  return {
    reactPanel,
    block,
    parentId: reactPanel.blocks.getParentId(block.id) ?? null,
    selection,
  };
}
