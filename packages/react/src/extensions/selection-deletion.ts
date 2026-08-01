import type { ReactEditor } from "../types";
import { BUILTIN_KEYMAP, KEYBOARD_BINDING_IDS } from "../managers";
import {
  focusSelectionCaret,
  isEditableKeyboardEvent,
  shouldDeleteSelection,
} from "../managers";

/**
 * Deletes expanded text and whole-block page selections atomically.
 *
 * Mouse block selection focuses the surface root instead of an editable node,
 * so the root-focus branch is essential. A focused toolbar, collapse toggle,
 * or drag handle cannot enter that branch and therefore keeps its own native
 * Delete/Backspace behavior.
 */
export function registerSelectionDeletion(reactEditor: ReactEditor): void {
  const { editor } = reactEditor;
  reactEditor.keyboard.register({
    id: KEYBOARD_BINDING_IDS.selectionDelete,
    keys: BUILTIN_KEYMAP[KEYBOARD_BINDING_IDS.selectionDelete],
    mode: "block",
    when: ({ selection, raw: event }) => {
      const root = reactEditor.events.getRoot();
      if (!root || !shouldDeleteSelection(selection)) return false;
      const rootBlockSelection = root.ownerDocument.activeElement === root &&
        selection.some((item) => item.type === "block");
      return rootBlockSelection || isEditableKeyboardEvent(event);
    },
  }, ({ root }) => {
    editor.deleteSelection();
    // Keep keyboard ownership inside Rivto immediately when a normal browser
    // briefly focuses a block deletion just removed. This does not address
    // Cursor Browser intercepting Ctrl/Cmd+Z before the page receives it; see
    // the known-host limitation documented in the history extension.
    if (!focusSelectionCaret(root, editor)) root.focus({ preventScroll: true });
    // React can replace an editable during reconciliation, so restore once more
    // after the new document DOM has committed.
    requestAnimationFrame(() => focusSelectionCaret(root, editor));
    return true;
  });
}
