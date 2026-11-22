import type { ReactEditorApi } from "../../../../editor/types";
/** Keyboard registration for outdenting a nested block at its start boundary. */
import { scheduleBlockFocus } from "../../../../block-behaviors/utils/focus-ops";
import { findParentBlock, findRenderedBlock } from "../../../../dom/block-dom";
import { removeFirstEmptyBlock } from "../block-merge/remove-first-empty-block";
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
 * Removes an eligible first empty block before attempting an outdent. A nested
 * block keeps its start caret even when the panel or a structural handler refuses the move.
 *
 * @param reactEditor - Runtime receiving the keyboard binding.
 * @returns With the Backspace binding registered on the editor.
 */
export function registerBlockOutdent(reactEditor: ReactEditorApi): void {
  reactEditor.keyboard.register(
    {
      id: KEYBOARD_BINDING_IDS.blockOutdentAtStart,
      keys: BUILTIN_KEYMAP[KEYBOARD_BINDING_IDS.blockOutdentAtStart],
      when: ({ reactPanel, raw: event, blockId }) =>
        isEditableKeyboardEvent(event) &&
        !shouldDeleteSelection(
          readKeyboardSelection(reactPanel.selection, reactPanel.blocks, blockId),
        ),
    },
    ({ reactPanel, root, blockId }) => {
      const target = firstKeyboardTarget(
        readKeyboardSelection(reactPanel.selection, reactPanel.blocks, blockId),
      );
      if (!target?.collapsed || target.offset !== 0) {
        return false;
      }
      const id = target.blockId;
      if (removeFirstEmptyBlock(reactPanel, root, id)) {
        return true;
      }
      const rendered = findRenderedBlock(root, id);
      if (!rendered || !findParentBlock(rendered)) {
        return false;
      }
      if (reactPanel.blocks.canOutdent(id)) {
        reactPanel.batchUpdates(() => reactPanel.blocks.outdentBlocks([id]));
      }
      scheduleBlockFocus(reactPanel, root, id, 0);
      return true;
    },
  );
}
