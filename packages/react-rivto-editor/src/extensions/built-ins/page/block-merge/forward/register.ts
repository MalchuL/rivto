import type { ReactEditorExtensionApi } from "../../../../../editor/types";
/**
 * Forward Delete dispatch at editable block boundaries.
 *
 * Eligibility stays here. The resolved block view owns merge and empty-block
 * removal so containers can refuse a merge without type switches in this file.
 *
 * @module
 */
import { createBlockSnapshotContext } from "../../../../../block-behaviors/utils/context";
import {
  BUILTIN_KEYMAP,
  firstKeyboardTarget,
  KEYBOARD_BINDING_IDS,
  readKeyboardSelection,
  shouldDeleteSelection,
} from "../../../../../managers";

/**
 * Registers forward merging at a collapsed block-end caret.
 *
 * @param reactEditor - Runtime receiving the keyboard binding.
 * @returns No value.
 */
export function registerForwardBlockMerge(reactEditor: ReactEditorExtensionApi): void {
  reactEditor.keyboard.register(
    {
      id: KEYBOARD_BINDING_IDS.blockMergeForward,
      keys: BUILTIN_KEYMAP[KEYBOARD_BINDING_IDS.blockMergeForward],
      when: ({ reactPanel, inputRoot, isBlockContentTarget, blockId }) =>
        inputRoot.isAttached() &&
        isBlockContentTarget() &&
        !shouldDeleteSelection(
          readKeyboardSelection(reactPanel.selection, reactPanel.blocks, blockId),
        ),
    },
    ({ reactPanel, blockId, inputRoot, inputRegistration }) => {
      if (!inputRoot.isAttached()) {
        return false;
      }
      const target = firstKeyboardTarget(
        readKeyboardSelection(reactPanel.selection, reactPanel.blocks, blockId),
      );
      const block = target?.collapsed ? reactPanel.blocks.getBlockNode(target.blockId) : undefined;
      if (!target?.collapsed || !block || target.offset !== block.content.length) {
        return false;
      }
      const context = createBlockSnapshotContext(
        reactPanel,
        target.blockId,
        reactPanel.selection.get(),
      );
      if (!context) {
        return false;
      }
      return reactPanel.editor.blockBehaviors.dispatch(
        "onMergeForward",
        { ...context, inputRoot, inputRegistration },
        target,
      );
    },
  );
}
