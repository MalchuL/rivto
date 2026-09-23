/** Keyboard registration for outdenting a nested block at its start boundary. */
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
import { dispatchViewAction } from "../../../../views/dispatch";

/**
 * Registers nested-block outdent behavior for Backspace at offset zero.
 *
 * @param reactEditor - Runtime receiving the keyboard binding.
 * @returns No value.
 */
export function registerBlockOutdent(reactEditor: ReactEditor): void {
  reactEditor.keyboard.register({
    id: KEYBOARD_BINDING_IDS.blockOutdentAtStart,
    keys: BUILTIN_KEYMAP[KEYBOARD_BINDING_IDS.blockOutdentAtStart],
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
      "onOutdentAtStart",
      context,
      target,
    );
  });
}
