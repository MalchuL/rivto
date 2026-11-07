import type { ReactEditorApi } from "../../../editor/types";
/**
 * Routes Backspace and Delete for expanded text and whole-block selections.
 * The extension reconciles an immediately clicked native caret before deciding
 * whether a previously portable structural selection still owns the key.
 *
 * @module
 */
import { isStructuralSelection } from "@chulane/rivto";
import { deletePanelSelection } from "../../../managers/selection/delete-panel-selection";
import {
  BUILTIN_KEYMAP,
  focusSelectionCaret,
  isEditableKeyboardEvent,
  KEYBOARD_BINDING_IDS,
  readKeyboardSelection,
  shouldDeleteSelection,
} from "../../../managers";

/**
 * Deletes expanded text and whole-block page selections atomically.
 *
 * Mouse block selection focuses the surface root instead of an editable node,
 * so the root-focus branch is essential. A focused toolbar, collapse toggle,
 * or drag handle cannot enter that branch and therefore keeps its own native
 * Delete/Backspace behavior.
 *
 * @param reactEditor - Editor owning the deletion binding and its lifecycle.
 * @returns After registering the binding; deletion occurs only on a matching keyboard event.
 */
export function registerSelectionDeletion(reactEditor: ReactEditorApi): void {
  reactEditor.keyboard.register(
    {
      id: KEYBOARD_BINDING_IDS.selectionDelete,
      keys: BUILTIN_KEYMAP[KEYBOARD_BINDING_IDS.selectionDelete],
      when: ({ reactPanel, selection, raw: event, blockId }) => {
        const root = reactPanel.getRoot();
        if (!root) {
          return false;
        }
        const editableEvent = isEditableKeyboardEvent(event);
        const current = editableEvent
          ? readKeyboardSelection(reactPanel.selection, reactPanel.blocks, blockId)
          : selection;
        if (!shouldDeleteSelection(current)) {
          return false;
        }
        const rootBlockSelection =
          root.ownerDocument.activeElement === root && isStructuralSelection(current);
        return rootBlockSelection || editableEvent;
      },
    },
    ({ reactPanel, root }) => {
      deletePanelSelection(reactPanel, root);
      // Keep keyboard ownership inside Rivto immediately when a normal browser
      // briefly focuses a block deletion just removed. This does not address
      // Cursor Browser intercepting Ctrl/Cmd+Z before the page receives it; see
      // the known-host limitation documented in the history extension.
      if (!focusSelectionCaret(root, reactPanel.selection)) {
        root.focus({ preventScroll: true });
      }
      // Only restore the caret and its editing focus; document deletion has already completed.
      reactPanel.selection.scheduleIfSelectionUnchanged(() =>
        focusSelectionCaret(root, reactPanel.selection),
      );
      return true;
    },
  );
}
