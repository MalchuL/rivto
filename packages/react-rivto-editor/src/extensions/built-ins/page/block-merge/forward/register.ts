import type { EditorRuntime } from "../../../../../editor/editor-runtime";
/**
 * Forward Delete dispatch at editable block boundaries.
 *
 * Eligibility stays here. The resolved block view owns merge and empty-block
 * removal so containers can refuse a merge without type switches in this file.
 *
 * @module
 */
import { createBlockBehaviorContext } from "../../../../../block-behaviors/index";
import {
  BUILTIN_KEYMAP,
  firstKeyboardTarget,
  isEditableKeyboardEvent,
  KEYBOARD_BINDING_IDS,
  readKeyboardSelection,
  shouldDeleteSelection,
} from "../../../../../managers";

/**
 * Registers forward merging at a collapsed block-end caret.
 *
 * @param editorRuntime - Runtime receiving the keyboard binding.
 * @returns No value.
 */
export function registerForwardBlockMerge(editorRuntime: EditorRuntime): void {
  editorRuntime.keyboard.register({
    id: KEYBOARD_BINDING_IDS.blockMergeForward,
    keys: BUILTIN_KEYMAP[KEYBOARD_BINDING_IDS.blockMergeForward],
    when: ({ editorView, raw: event, blockId }) =>
      isEditableKeyboardEvent(event) &&
      !shouldDeleteSelection(readKeyboardSelection(editorView.selection, editorView.runtime.blocks, blockId)),
  }, ({ editorView, root, blockId }) => {
    const target = firstKeyboardTarget(readKeyboardSelection(editorView.selection, editorView.runtime.blocks, blockId));
    const block = target?.collapsed ? editorView.runtime.blocks.getBlockNode(target.blockId) : undefined;
    if (!target?.collapsed || !block || target.offset !== block.content.length) return false;
    const context = createBlockBehaviorContext(editorView, target.blockId, root, editorView.selection.get());
    if (!context) return false;
    return editorView.runtime.blockBehaviors.dispatch(
      "onMergeForward",
      context,
      target,
    );
  });
}
