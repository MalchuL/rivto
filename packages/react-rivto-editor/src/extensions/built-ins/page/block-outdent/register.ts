import type { ReactEditorApi } from "../../../../editor/types";
/** Keyboard registration for outdenting a nested block at its start boundary. */
import { createBlockBehaviorContext } from "../../../../block-behaviors/context";
import { BUILTIN_KEYMAP, firstKeyboardTarget, isEditableKeyboardEvent, KEYBOARD_BINDING_IDS, readKeyboardSelection, shouldDeleteSelection } from "../../../../managers";

/**
 * Registers nested-block outdent behavior for Backspace at offset zero.
 *
 * @param reactEditor - Runtime receiving the keyboard binding.
 * @returns No value.
 */
export function registerBlockOutdent(reactEditor: ReactEditorApi): void {
  reactEditor.keyboard.register({
    id: KEYBOARD_BINDING_IDS.blockOutdentAtStart,
    keys: BUILTIN_KEYMAP[KEYBOARD_BINDING_IDS.blockOutdentAtStart],
    when: ({ panel, raw: event, blockId }) =>
      isEditableKeyboardEvent(event) &&
      !shouldDeleteSelection(readKeyboardSelection(panel.selection, panel.blocks, blockId)),
  }, ({ panel, root, blockId }) => {
    const target = firstKeyboardTarget(readKeyboardSelection(panel.selection, panel.blocks, blockId));
    if (!target?.collapsed || target.offset !== 0) return false;
    const context = createBlockBehaviorContext(panel, target.blockId, root, panel.selection.get());
    if (!context) return false;
    return panel.editor.blockBehaviors.dispatch(
      "onOutdentAtStart",
      context,
      target,
    );
  });
}
