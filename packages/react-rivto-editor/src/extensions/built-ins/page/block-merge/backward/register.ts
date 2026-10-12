import type { ReactEditorApi } from "../../../../../editor/types";
/** Keyboard registration for backward block merging at a content boundary. */
import { createBlockBehaviorContext } from "../../../../../block-behaviors/context";
import { BUILTIN_KEYMAP, firstKeyboardTarget, isEditableKeyboardEvent, KEYBOARD_BINDING_IDS, readKeyboardSelection, shouldDeleteSelection } from "../../../../../managers";

/**
 * Registers backward merge behavior for Backspace at offset zero.
 *
 * @param reactEditor - Runtime receiving the keyboard binding.
 * @returns No value.
 */
export function registerBackwardBlockMerge(reactEditor: ReactEditorApi): void {
  reactEditor.keyboard.register({
    id: KEYBOARD_BINDING_IDS.blockMergeBackward,
    keys: BUILTIN_KEYMAP[KEYBOARD_BINDING_IDS.blockMergeBackward],
    when: ({ panel, raw: event, blockId }) =>
      isEditableKeyboardEvent(event) &&
      !shouldDeleteSelection(readKeyboardSelection(panel.selection, panel.blocks, blockId)),
  }, ({ panel, root, blockId }) => {
    const target = firstKeyboardTarget(readKeyboardSelection(panel.selection, panel.blocks, blockId));
    if (!target?.collapsed || target.offset !== 0) return false;
    const context = createBlockBehaviorContext(panel, target.blockId, root, panel.selection.get());
    if (!context) return false;
    return panel.editor.blockBehaviors.dispatch(
      "onMergeBackward",
      context,
      target,
    );
  });
}
