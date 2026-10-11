import type { EditorRuntime } from "../../../../editor/editor-runtime";
/** Keyboard registration for outdenting a nested block at its start boundary. */
import { createBlockBehaviorContext } from "../../../../block-behaviors/context";
import {
  BUILTIN_KEYMAP,
  firstKeyboardTarget,
  isEditableKeyboardEvent,
  KEYBOARD_BINDING_IDS,
  readKeyboardSelection,
  shouldDeleteSelection,
} from "../../../../managers";

/**
 * Registers nested-block outdent behavior for Backspace at offset zero.
 *
 * @param editorRuntime - Runtime receiving the keyboard binding.
 * @returns No value.
 */
export function registerBlockOutdent(editorRuntime: EditorRuntime): void {
  editorRuntime.keyboard.register({
    id: KEYBOARD_BINDING_IDS.blockOutdentAtStart,
    keys: BUILTIN_KEYMAP[KEYBOARD_BINDING_IDS.blockOutdentAtStart],
    when: ({ editorView, raw: event, blockId }) =>
      isEditableKeyboardEvent(event) &&
      !shouldDeleteSelection(readKeyboardSelection(editorView.selection, editorView.runtime.blocks, blockId)),
  }, ({ editorView, root, blockId }) => {
    const target = firstKeyboardTarget(readKeyboardSelection(editorView.selection, editorView.runtime.blocks, blockId));
    if (!target?.collapsed || target.offset !== 0) return false;
    const context = createBlockBehaviorContext(editorView, target.blockId, root, editorView.selection.get());
    if (!context) return false;
    return editorView.runtime.blockBehaviors.dispatch(
      "onOutdentAtStart",
      context,
      target,
    );
  });
}
