import type { ReactEditorExtensionApi } from "../../../../editor/types";
/** Keyboard registration for resetting the first empty custom block. */
import { createBlockSnapshotContext } from "../../../../block-behaviors/utils/context";
import {
  BUILTIN_KEYMAP,
  firstKeyboardTarget,
  KEYBOARD_BINDING_IDS,
  readKeyboardSelection,
  shouldDeleteSelection,
} from "../../../../managers";

/**
 * Registers reset-to-writing behavior for Backspace at offset zero.
 *
 * @param reactEditor - Runtime receiving the keyboard binding.
 * @returns No value.
 */
export function registerEmptyBlockReset(reactEditor: ReactEditorExtensionApi): void {
  reactEditor.keyboard.register(
    {
      id: KEYBOARD_BINDING_IDS.emptyBlockReset,
      keys: BUILTIN_KEYMAP[KEYBOARD_BINDING_IDS.emptyBlockReset],
      when: ({ reactPanel, inputRoot, isBlockContentTarget, blockId }) =>
        inputRoot.isAttached() &&
        isBlockContentTarget() &&
        !shouldDeleteSelection(
          readKeyboardSelection(reactPanel.selection, reactPanel.blocks, blockId),
        ),
    },
    ({ reactPanel, blockId, inputRoot, inputRegistration }) => {
      if (!inputRoot.isAttached()) {
        return false;
      }
      const target = firstKeyboardTarget(
        readKeyboardSelection(reactPanel.selection, reactPanel.blocks, blockId),
      );
      if (!target?.collapsed || target.offset !== 0) {
        return false;
      }
      const context = createBlockSnapshotContext(
        reactPanel,
        target.blockId,
        reactPanel.selection.get(),
      );
      if (!context) {
        return false;
      }
      return reactPanel.editor.blockBehaviors.dispatch(
        "onResetEmpty",
        { ...context, inputRoot, inputRegistration },
        target,
      );
    },
  );
}
