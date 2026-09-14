/**
 * Forward Delete dispatch at editable block boundaries.
 *
 * Eligibility stays here. The resolved block view owns merge and empty-block
 * removal so containers can refuse a merge without type switches in this file.
 *
 * @module
 */
import type { ReactEditor } from "../../../../../types";
import {
  BUILTIN_KEYMAP,
  firstKeyboardTarget,
  isEditableKeyboardEvent,
  KEYBOARD_BINDING_IDS,
  readKeyboardSelection,
  shouldDeleteSelection,
} from "../../../../../managers";
import { createBlockViewContext, dispatchViewAction } from "../../../../../views";

/**
 * Registers forward merging at a collapsed block-end caret.
 *
 * @param reactEditor - Runtime receiving the keyboard binding.
 * @returns No value.
 */
export function registerForwardBlockMerge(reactEditor: ReactEditor): void {
  const { editor } = reactEditor;
  reactEditor.keyboard.register({
    id: KEYBOARD_BINDING_IDS.blockMergeForward,
    keys: BUILTIN_KEYMAP[KEYBOARD_BINDING_IDS.blockMergeForward],
    when: ({ raw: event, blockId }) =>
      isEditableKeyboardEvent(event) &&
      !shouldDeleteSelection(readKeyboardSelection(reactEditor.selection, editor, blockId)),
  }, ({ root, blockId }) => {
    const target = firstKeyboardTarget(readKeyboardSelection(reactEditor.selection, editor, blockId));
    const block = target?.collapsed ? editor.blocks.getBlock(target.blockId) : undefined;
    if (!target?.collapsed || !block || target.offset !== block.content.length) return false;
    const context = createBlockViewContext(reactEditor, target.blockId, root, reactEditor.selection.get());
    if (!context) return false;
    return dispatchViewAction(
      reactEditor.views.resolve(context.block.id),
      reactEditor.views.fallback,
      "onMergeForward",
      context,
      target,
    );
  });
}
