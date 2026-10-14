import type { ReactEditorApi } from "../../../../editor/types";
/**
 * Enter dispatch for outline block splitting and creation.
 *
 * The declarative `block.create` binding decides which key invokes this action.
 * The resolved block view owns the semantic (split, insert-first-child, lift
 * an empty nested block). This module only reads the caret, deletes an
 * expanded selection, and claims the key.
 *
 * @module
 */
import { createBlockBehaviorContext } from "../../../../block-behaviors";
import {
  BUILTIN_KEYMAP,
  firstKeyboardTarget,
  isEditableKeyboardEvent,
  KEYBOARD_BINDING_IDS,
  shouldDeleteSelection,
} from "../../../../managers";

/**
 * Installs outline block splitting for Page and Edgeless surfaces.
 *
 * The first covered block supplies the only insertion target, so a multi-item
 * selection never creates several blocks. Expanded text is deleted first.
 * Shift+Enter remains native plaintext input.
 *
 * @param reactEditor - Runtime whose keyboard registry and views are used.
 * @returns Nothing; the binding is owned by the extension lifecycle.
 */
export function registerBlockCreation(reactEditor: ReactEditorApi): void {
  reactEditor.keyboard.register(
    {
      id: KEYBOARD_BINDING_IDS.blockCreate,
      keys: BUILTIN_KEYMAP[KEYBOARD_BINDING_IDS.blockCreate]!,
    },
    ({ reactPanel, raw: event, root }) => {
      if (!isEditableKeyboardEvent(event)) {
        return false;
      }
      // Read the key event's native caret synchronously. A newly focused editor
      // can receive Enter before the browser's deferred selectionchange event.
      const nativeSelection = reactPanel.selection.readDOM();
      if (nativeSelection) {
        reactPanel.selection.set(nativeSelection);
      }
      const selection = nativeSelection ?? reactPanel.selection.get();
      const initialTarget = firstKeyboardTarget(selection);
      if (!initialTarget) {
        return false;
      }

      let claimed = false;
      // Selection deletion, text splitting, insertion, and nesting share one CRDT
      // transaction, so Enter is one collaborative update and one undo step.
      reactPanel.batchUpdates(() => {
        let target = initialTarget;
        if (shouldDeleteSelection(selection)) {
          reactPanel.selection.delete();
          const collapsed = firstKeyboardTarget(reactPanel.selection.get());
          if (!collapsed?.collapsed) {
            return;
          }
          target = collapsed;
        }
        const context = createBlockBehaviorContext(
          reactPanel,
          target.blockId,
          root,
          reactPanel.selection.get(),
        );
        if (!context) {
          return;
        }
        claimed = reactPanel.editor.blockBehaviors.dispatch("onSplit", context, target);
      });
      return claimed;
    },
  );
}
