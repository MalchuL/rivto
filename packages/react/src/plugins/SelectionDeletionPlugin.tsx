import { useEditor, useEditorRoot, useKeyboardEvent } from "../hooks";
import { BUILTIN_KEYMAP, KEYBOARD_BINDING_IDS } from "../events/keymap";
import {
  focusSelectionCaret,
  isEditableKeyboardEvent,
  shouldDeleteSelection,
} from "../events/utils/keyboard/selection";

/**
 * Deletes expanded text and whole-block page selections atomically.
 *
 * Mouse block selection focuses the surface root instead of an editable node,
 * so the root-focus branch is essential. A focused toolbar, collapse toggle,
 * or drag handle cannot enter that branch and therefore keeps its own native
 * Delete/Backspace behavior.
 */
export function SelectionDeletionPlugin() {
  const editor = useEditor();
  const { element: root } = useEditorRoot();

  useKeyboardEvent({
    id: KEYBOARD_BINDING_IDS.selectionDelete,
    keys: BUILTIN_KEYMAP[KEYBOARD_BINDING_IDS.selectionDelete],
    mode: "block",
    when: ({ selection, event }) => {
      if (!root || !shouldDeleteSelection(selection)) return false;
      const rootBlockSelection = root.ownerDocument.activeElement === root &&
        selection.some((item) => item.type === "block");
      return rootBlockSelection || isEditableKeyboardEvent(event);
    },
  }, () => {
    if (!root) return false;
    editor.deleteSelection();
    requestAnimationFrame(() => focusSelectionCaret(root, editor));
    return true;
  });

  return null;
}
