import type { ReactEditorApi } from "../../../../../editor/types";
/**
 * Forward Delete dispatch at editable block boundaries.
 *
 * Eligibility stays here. The resolved block view owns merge and empty-block
 * removal so containers can refuse a merge without type switches in this file.
 *
 * @module
 */
import { createBlockBehaviorContext } from "../../../../../block-behaviors";
import { BUILTIN_KEYMAP, firstKeyboardTarget, isEditableKeyboardEvent, KEYBOARD_BINDING_IDS, readKeyboardSelection, shouldDeleteSelection } from "../../../../../managers";

/**
 * Registers forward merging at a collapsed block-end caret.
 *
 * @param reactEditor - Runtime receiving the keyboard binding.
 * @returns No value.
 */
export function registerForwardBlockMerge(reactEditor: ReactEditorApi): void {
  reactEditor.keyboard.register({
    id: KEYBOARD_BINDING_IDS.blockMergeForward,
    keys: BUILTIN_KEYMAP[KEYBOARD_BINDING_IDS.blockMergeForward],
    when: ({ reactPanel, raw: event, blockId }) =>
      isEditableKeyboardEvent(event) &&
      !shouldDeleteSelection(readKeyboardSelection(reactPanel.selection, reactPanel.blocks, blockId)),
  }, ({ reactPanel, root, blockId }) => {
    const target = firstKeyboardTarget(readKeyboardSelection(reactPanel.selection, reactPanel.blocks, blockId));
    const block = target?.collapsed ? reactPanel.blocks.getBlockNode(target.blockId) : undefined;
    if (!target?.collapsed || !block || target.offset !== block.content.length) return false;
    const context = createBlockBehaviorContext(reactPanel, target.blockId, root, reactPanel.selection.get());
    if (!context) return false;
    return reactPanel.editor.blockBehaviors.dispatch(
      "onMergeForward",
      context,
      target,
    );
  });
}
