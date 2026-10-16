/**
 * Builds the snapshots behavior methods receive from page and outline callers.
 * Keyboard methods include DOM state; outline methods use shallow block fields.
 *
 * @module
 */
import type { Selection } from "@chulane/rivto";
import type { ReactPanelApi } from "../../panels/types";
import type { BlockBehaviorContext, BlockOutlineContext } from "../types";

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
  reactPanel: ReactPanelApi,
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
 * Resolves a live block into a behavior context, or `undefined` when it is missing.
 *
 * @param reactPanel - Editor view providing the document and selection.
 * @param blockId - Placed block whose behavior will run.
 * @param root - Active surface or edgeless card.
 * @param selection - Portable selection captured for this event.
 * @returns Context for that block, or `undefined` when it is unplaced.
 */
export function createBlockBehaviorContext(
  reactPanel: ReactPanelApi,
  blockId: string,
  root: HTMLElement,
  selection?: Selection,
): BlockBehaviorContext | undefined {
  const block = reactPanel.blocks.getBlock(blockId);
  if (!block) {
    return undefined;
  }
  return {
    reactPanel,
    block,
    parentId: reactPanel.blocks.getParentId(block.id) ?? null,
    selection,
    root,
  };
}
