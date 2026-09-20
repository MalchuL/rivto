/**
 * Removal of an empty root writing block after a structural predecessor.
 *
 * @module
 */
import { createStructuralSelection } from "@chulane/rivto";
import {
  BLOCK_CONTENT_SELECTOR,
  BLOCK_ID_ATTRIBUTE,
  BLOCK_ID_SELECTOR,
} from "../../../../constants";
import { findRenderedBlock } from "../../../../managers";
import type { ReactEditor } from "../../../../types";

/** Returns true when a BlockView directly owns an editable content host. */
function hasOwnedEditableContent(block: HTMLElement): boolean {
  return Array.from(block.querySelectorAll<HTMLElement>(BLOCK_CONTENT_SELECTOR))
    .some((content) => content.closest(BLOCK_ID_SELECTOR) === block);
}

/** Resolves the current BlockView's immediately preceding sibling BlockView. */
function previousSiblingBlock(
  root: HTMLElement,
  blockId: string,
): { readonly element: HTMLElement; readonly id: string } | undefined {
  const current = findRenderedBlock(root, blockId);
  const previous = current?.previousElementSibling;
  if (!(previous instanceof HTMLElement) || !previous.matches(BLOCK_ID_SELECTOR)) return;
  const id = previous.getAttribute(BLOCK_ID_ATTRIBUTE);
  return id ? { element: previous, id } : undefined;
}

/**
 * Removes a root empty writing block after a non-text-editable sibling.
 *
 * @param reactEditor - Runtime owning host emptiness policy and block rendering.
 * @param root - Active page surface or edgeless card DOM scope.
 * @param blockId - Collapsed editable block addressed by the key event.
 * @returns True when the empty block was removed and the key was claimed.
 */
export function removeEmptyBlockAfterStructuralPredecessor(
  reactEditor: ReactEditor,
  root: HTMLElement,
  blockId: string,
): boolean {
  const { isEmptyBlock } = reactEditor;
  const block = reactEditor.blocks.getBlockNode(blockId);
  if (
    !block ||
    !isEmptyBlock(block) ||
    block.listProps.collapsed === true ||
    !reactEditor.blocks.isRootBlock(block.id)
  ) return false;

  const previous = previousSiblingBlock(root, block.id);
  if (!previous || hasOwnedEditableContent(previous.element)) return false;

  reactEditor.history.batchUpdates(() => {
    const firstChildId = reactEditor.blocks.getChildIds(block.id)[0];
    if (firstChildId) reactEditor.blocks.outdentBlock(firstChildId);
    reactEditor.blocks.removeBlock(block.id);
    reactEditor.selection.set(createStructuralSelection([previous.id]));
  });
  root.ownerDocument.getSelection()?.removeAllRanges();
  root.focus({ preventScroll: true });
  return true;
}
