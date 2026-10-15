import type { ReactPanelApi } from "../../../panels/types";
import type { ReactEditorApi } from "../../../editor/types";
/**
 * Routes Backspace and Delete for expanded text and whole-block selections.
 * The extension reconciles an immediately clicked native caret before deciding
 * whether a previously portable structural selection still owns the key.
 *
 * @module
 */
import { getSelectedBlockIds, isStructuralSelection } from "@chulane/rivto";
import { createBlockBehaviorContext } from "../../../block-behaviors/context";
import type { BlockBehavior } from "../../../block-behaviors/types";
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
        const root = reactPanel.events.getRoot();
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

/**
 * Deletes the panel's current selection using registered container policies.
 *
 * For structural selections, each distinct block behavior is consulted once. The
 * first non-default outcome claims the whole selection and suppresses generic
 * deletion. Otherwise selection.delete handles the selection, including expanded
 * text. Policy calls and deletion share one panel batch; focus is left to callers.
 *
 * @param reactPanel - Occurrence whose current selection and block behaviors are used.
 * @param root - Mounted surface root passed to structural-deletion behavior contexts.
 * @returns No value after the selected behavior or generic deletion completes.
 */
export function deletePanelSelection(reactPanel: ReactPanelApi, root: HTMLElement): void {
  const current = reactPanel.selection.get();
  reactPanel.batchUpdates(() => {
    if (current && isStructuralSelection(current)) {
      const ids = getSelectedBlockIds(current);
      const seen = new Set<BlockBehavior>();
      // A non-default outcome claims the whole selection and skips generic deletion.
      let claimed = false;
      for (const id of ids) {
        const behavior = reactPanel.editor.blockBehaviors.resolve(id);
        if (seen.has(behavior)) {
          continue;
        }
        seen.add(behavior);
        const context = createBlockBehaviorContext(reactPanel, id, root, current);
        if (context && behavior.onStructuralDelete(context, ids) !== "default") {
          claimed = true;
          break;
        }
      }
      if (claimed) {
        return;
      }
    }
    reactPanel.selection.delete();
  });
}
