/** Keyboard registration for backward block merging at a content boundary. */
import {
  BUILTIN_KEYMAP,
  firstKeyboardTarget,
  isEditableKeyboardEvent,
  KEYBOARD_BINDING_IDS,
  readKeyboardSelection,
  shouldDeleteSelection,
} from "../../../../../managers";
import type { ReactEditor } from "../../../../../types";
import { createBlockViewContext } from "../../../../../views/context";
import { dispatchViewAction } from "../../../../../views/dispatch";

/**
 * Registers backward merge behavior for Backspace at offset zero.
 *
 * @param reactEditor - Runtime receiving the keyboard binding.
 * @returns No value.
 */
export function registerBackwardBlockMerge(reactEditor: ReactEditor): void {
  reactEditor.keyboard.register({
    id: KEYBOARD_BINDING_IDS.blockMergeBackward,
    keys: BUILTIN_KEYMAP[KEYBOARD_BINDING_IDS.blockMergeBackward],
    when: ({ raw: event, blockId }) =>
      isEditableKeyboardEvent(event) &&
      !shouldDeleteSelection(readKeyboardSelection(reactEditor.selection, reactEditor, blockId)),
  }, ({ root, blockId }) => {
    const target = firstKeyboardTarget(readKeyboardSelection(reactEditor.selection, reactEditor, blockId));
    if (!target?.collapsed || target.offset !== 0) return false;
    const context = createBlockViewContext(reactEditor, target.blockId, root, reactEditor.selection.get());
    if (!context) return false;
    return dispatchViewAction(
      reactEditor.views.resolve(context.block.id),
      reactEditor.views.fallback,
      "onMergeBackward",
      context,
      target,
    );
  });
}
