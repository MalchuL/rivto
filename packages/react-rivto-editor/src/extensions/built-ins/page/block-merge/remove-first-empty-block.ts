import { focusCaret } from "../../../../block-behaviors/utils/focus-ops";
import { findAdjacentEditableBlock } from "../../../../dom/block-dom";
import type { ReactPanelApi } from "../../../../panels/types";
import { navigationDomRoot, owningBlockElement } from "../navigation/utils/scope";

/**
 * Removes a first empty writing block or the only block in its surface.
 *
 * Leaves child-bearing blocks intact. An empty surface retains keyboard focus
 * so undo remains available after its last block is removed.
 *
 * A structural behavior can consume Backspace while keeping the block. Wait for generic
 * removal to succeed before changing card endpoints, discarding geometry, or moving focus.
 *
 * @param reactPanel - Panel owning the block, selection and undo batch.
 * @param root - Surface receiving Backspace and subsequent focus.
 * @param blockId - Block containing the collapsed start caret.
 * @returns Whether Backspace was consumed, including when a structural behavior vetoed removal.
 */
export function removeFirstEmptyBlock(
  reactPanel: ReactPanelApi,
  root: HTMLElement,
  blockId: string,
): boolean {
  const node = reactPanel.blocks.getBlockNode(blockId);
  // Keep subtrees, panel boundary roots, and semantically nonempty writing blocks intact.
  if (
    !node ||
    node.childIds.length ||
    !reactPanel.blocks.canRemove(blockId) ||
    !reactPanel.editor.defaultWritingBlockFactory.isEmptyBlock(node)
  ) {
    // Defer to the normal Backspace behavior for this block.
    return false;
  }
  const parentId = reactPanel.blocks.getParentId(blockId);
  const siblings =
    parentId == null ? reactPanel.blocks.getRootIds() : reactPanel.blocks.getChildIds(parentId);
  const index = siblings.indexOf(blockId);
  // A card can start after the first document root; nested blocks use their own sibling list.
  const card =
    parentId == null && reactPanel.getSurfaceType() === "edgeless"
      ? owningBlockElement(reactPanel, blockId)
      : undefined;
  if (index < 0 || (index !== 0 && card?.props.startBlockId !== blockId)) {
    // Only the first block in this editing region qualifies.
    return false;
  }
  const nextSibling = siblings[index + 1];
  // A single-block card has no next block in its surface, even if document roots follow it.
  if (siblings.length === 1 || (card && card.props.endBlockId === blockId)) {
    // Keep cards with element children or another endpoint intact.
    const cards = reactPanel.elements
      .getElementNodes()
      .filter(
        (element) =>
          element.type === "block" &&
          (element.props.startBlockId === blockId || element.props.endBlockId === blockId),
      );
    if (
      cards.some(
        (element) =>
          element.childIds.length ||
          element.props.startBlockId !== blockId ||
          element.props.endBlockId !== blockId,
      )
    ) {
      // Preserve a card that owns other content or spans additional blocks.
      return false;
    }
    reactPanel.batchUpdates(() => {
      if (!reactPanel.blocks.removeBlocks([blockId])) {
        // A structural handler kept the block, so retain its card and focus.
        return;
      }
      cards.forEach((element) => reactPanel.elements.removeElement(element.id));
      reactPanel.selection.clear();
      root.focus({ preventScroll: true });
    });
    // Backspace was consumed even if a structural handler kept the block.
    return true;
  }
  if (!nextSibling) {
    // Without a successor, another behavior owns this boundary.
    return false;
  }
  const scope = navigationDomRoot(root, blockId);
  const next = findAdjacentEditableBlock(scope, blockId, "next");
  // Do not skip a structural block or move focus into another card or descendant.
  if (!next || next.blockId !== nextSibling) {
    // Only the immediate editable sibling can receive the caret.
    return false;
  }
  // Keep card ranges and block deletion in the same undo item; publish focus after removal.
  reactPanel.batchUpdates(() => {
    if (!reactPanel.blocks.removeBlocks([blockId])) {
      // A veto leaves the card endpoints and selection intact.
      return;
    }
    for (const element of reactPanel.elements.getElementNodes()) {
      if (element.type !== "block") {
        continue;
      }
      const { startBlockId, endBlockId } = element.props;
      if (startBlockId === blockId || endBlockId === blockId) {
        reactPanel.elements.updateElement(element.id, {
          props: {
            startBlockId: startBlockId === blockId ? next.blockId : startBlockId,
            endBlockId: endBlockId === blockId ? next.blockId : endBlockId,
          },
        });
      }
    }
    focusCaret(reactPanel, root, next.blockId, 0);
  });
  return true;
}
