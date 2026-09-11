/**
 * Routes Backspace and Delete for expanded text and whole-block selections.
 * The extension reconciles an immediately clicked native caret before deciding
 * whether a previously portable structural selection still owns the key.
 *
 * @module
 */
import type { ReactEditor } from "../../types";
import { BUILTIN_KEYMAP, KEYBOARD_BINDING_IDS } from "../../managers";
import {
  focusSelectionCaret,
  isEditableKeyboardEvent,
  readKeyboardSelection,
  shouldDeleteSelection,
} from "../../managers";
import { isStructuralSelection } from "@chulane/rivto";

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
    when: ({ selection, raw: event, blockId }) => {
      const root = reactEditor.events.getRoot();
      if (!root) return false;
      const editableEvent = isEditableKeyboardEvent(event);
      const current = editableEvent
        ? readKeyboardSelection(reactEditor.selection, editor, blockId)
        : selection;
      if (!shouldDeleteSelection(current)) return false;
      const rootBlockSelection = root.ownerDocument.activeElement === root &&
        isStructuralSelection(current);
      return rootBlockSelection || editableEvent;
    },
  }, ({ root }) => {
    reactEditor.selection.delete();
    // Keep keyboard ownership inside Rivto immediately when a normal browser
    // briefly focuses a block deletion just removed. This does not address
    // Cursor Browser intercepting Ctrl/Cmd+Z before the page receives it; see
    // the known-host limitation documented in the history extension.
    if (!focusSelectionCaret(root, reactEditor.selection)) root.focus({ preventScroll: true });
    requestAnimationFrame(() => focusSelectionCaret(root, reactEditor.selection));
    return true;
  });
}
