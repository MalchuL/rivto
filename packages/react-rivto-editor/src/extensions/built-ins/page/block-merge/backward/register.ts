import type { EditorRuntime } from "../../../../../editor-runtime";
/** Keyboard registration for backward block merging at a content boundary. */
import {
  BUILTIN_KEYMAP,
  firstKeyboardTarget,
  isEditableKeyboardEvent,
  KEYBOARD_BINDING_IDS,
  readKeyboardSelection,
  shouldDeleteSelection,
} from "../../../../../managers";
import { createBlockViewContext } from "../../../../../views/context";

/**
 * Registers backward merge behavior for Backspace at offset zero.
 *
 * @param editorRuntime - Runtime receiving the keyboard binding.
 * @returns No value.
 */
export function registerBackwardBlockMerge(editorRuntime: EditorRuntime): void {
  editorRuntime.keyboard.register({
    id: KEYBOARD_BINDING_IDS.blockMergeBackward,
    keys: BUILTIN_KEYMAP[KEYBOARD_BINDING_IDS.blockMergeBackward],
    when: ({ editorView, raw: event, blockId }) =>
      isEditableKeyboardEvent(event) &&
      !shouldDeleteSelection(readKeyboardSelection(editorView.selection, editorView.blocks, blockId)),
  }, ({ editorView, root, blockId }) => {
    const target = firstKeyboardTarget(readKeyboardSelection(editorView.selection, editorView.blocks, blockId));
    if (!target?.collapsed || target.offset !== 0) return false;
    const context = createBlockViewContext(editorView, target.blockId, root, editorView.selection.get());
    if (!context) return false;
    return editorView.views.dispatch(
      "onMergeBackward",
      context,
      target,
    );
  });
}
