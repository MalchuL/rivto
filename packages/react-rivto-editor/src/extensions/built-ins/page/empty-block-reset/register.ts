/** Keyboard registration for resetting the first empty custom block. */
import {
  BUILTIN_KEYMAP,
  firstKeyboardTarget,
  isEditableKeyboardEvent,
  KEYBOARD_BINDING_IDS,
  readKeyboardSelection,
  shouldDeleteSelection,
} from "../../../../managers";
import type { ReactEditor } from "../../../../types";
import { createBlockViewContext } from "../../../../views/context";

/**
 * Registers reset-to-writing behavior for Backspace at offset zero.
 *
 * @param reactEditor - Runtime receiving the keyboard binding.
 * @returns No value.
 */
export function registerEmptyBlockReset(reactEditor: ReactEditor): void {
  reactEditor.keyboard.register({
    id: KEYBOARD_BINDING_IDS.emptyBlockReset,
    keys: BUILTIN_KEYMAP[KEYBOARD_BINDING_IDS.emptyBlockReset],
    when: ({ reactEditor, raw: event, blockId }) =>
      isEditableKeyboardEvent(event) &&
      !shouldDeleteSelection(readKeyboardSelection(reactEditor.selection, reactEditor, blockId)),
  }, ({ reactEditor, root, blockId }) => {
    const target = firstKeyboardTarget(readKeyboardSelection(reactEditor.selection, reactEditor, blockId));
    if (!target?.collapsed || target.offset !== 0) return false;
    const context = createBlockViewContext(reactEditor, target.blockId, root, reactEditor.selection.get());
    if (!context) return false;
    return reactEditor.views.dispatch(
      "onResetEmpty",
      context,
      target,
    );
  });
}
