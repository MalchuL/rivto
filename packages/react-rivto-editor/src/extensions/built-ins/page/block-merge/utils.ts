/**
 * Removal of an empty root writing block after a structural predecessor.
 *
 * @module
 */
import { createStructuralSelection } from "@chulane/rivto";
import type { InputRoot } from "@chulane/rivto-root";
import type { PanelInputRegistration } from "../../../../panels/types";
import type { BlockEditingPanel } from "../../../../block-behaviors/types";

/**
 * Removes a root empty writing block after a non-text-editable sibling.
 *
 * Canonical root order determines the preceding sibling. It must be rendered
 * within the same page or card; virtualized or modal wrappers do not change
 * sibling identity. The edit promotes the first child when present and selects
 * the predecessor. Browser focus is restored only while the occurrence remains current.
 *
 * @param reactPanel - Editor view owning host emptiness policy and block rendering.
 * @param blockId - Collapsed editable block addressed by the key event.
 * @param inputRoot - Originating keyboard attachment, omitted for direct UI calls.
 * @param inputRegistration - Keyboard routing lifetime, omitted for direct UI calls.
 * @returns True when the empty block was removed and the key was claimed.
 * @throws Propagates document, selection, and browser focus failures.
 */
export function removeEmptyBlockAfterStructuralPredecessor(
  reactPanel: BlockEditingPanel,
  blockId: string,
  inputRoot?: Pick<InputRoot, "isAttached">,
  inputRegistration?: PanelInputRegistration,
): boolean {
  const { defaultWritingBlockFactory } = reactPanel.editor;
  const block = reactPanel.blocks.getBlockNode(blockId);
  if (
    !block ||
    !defaultWritingBlockFactory.isEmptyBlock(block) ||
    !reactPanel.blocks.canRemove(block.id) ||
    block.listProps.collapsed === true ||
    !reactPanel.blocks.getRootIds().includes(block.id)
  ) {
    return false;
  }

  const roots = reactPanel.blocks.getRootIds();
  const previousId = roots[roots.indexOf(block.id) - 1];
  if (!previousId) {
    return false;
  }

  return reactPanel.selection.runWithStructuralPredecessorFocus(
    block.id,
    previousId,
    () => {
      reactPanel.batchUpdates(() => {
        const firstChildId = reactPanel.blocks.getBlockNode(block.id)?.childIds[0];
        if (firstChildId) {
          reactPanel.blocks.outdentBlock(firstChildId);
        }
        reactPanel.blocks.removeBlock(block.id);
        reactPanel.selection.set(createStructuralSelection([previousId]));
      });
    },
    inputRoot,
    inputRegistration,
  );
}
