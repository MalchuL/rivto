import type { EditorRuntime } from "../../../../editor-runtime";
/** Keyboard registration for resetting the first empty custom block. */
import {
  BUILTIN_KEYMAP,
  firstKeyboardTarget,
  isEditableKeyboardEvent,
  KEYBOARD_BINDING_IDS,
  readKeyboardSelection,
  shouldDeleteSelection,
} from "../../../../managers";
import { createBlockViewContext } from "../../../../views/context";

/**
 * Registers reset-to-writing behavior for Backspace at offset zero.
 *
 * @param editorRuntime - Runtime receiving the keyboard binding.
 * @returns No value.
 */
export function registerEmptyBlockReset(editorRuntime: EditorRuntime): void {
  editorRuntime.keyboard.register({
    id: KEYBOARD_BINDING_IDS.emptyBlockReset,
    keys: BUILTIN_KEYMAP[KEYBOARD_BINDING_IDS.emptyBlockReset],
    when: ({ editorView, raw: event, blockId }) =>
      isEditableKeyboardEvent(event) &&
      !shouldDeleteSelection(readKeyboardSelection(editorView.selection, editorView.blocks, blockId)),
  }, ({ editorView, root, blockId }) => {
    const target = firstKeyboardTarget(readKeyboardSelection(editorView.selection, editorView.blocks, blockId));
    if (!target?.collapsed || target.offset !== 0) return false;
    const context = createBlockViewContext(editorView, target.blockId, root, editorView.selection.get());
    if (!context) return false;
    return editorView.views.dispatch(
      "onResetEmpty",
      context,
      target,
    );
  });
}
