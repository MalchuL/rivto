import type { ReactEditorExtensionApi } from "../../../../editor/types";
/** Keyboard registration for outdenting a nested block at its start boundary. */
import { createBlockSnapshotContext } from "../../../../block-behaviors/utils/context";
import {
  BUILTIN_KEYMAP,
  firstKeyboardTarget,
  KEYBOARD_BINDING_IDS,
  readKeyboardSelection,
  shouldDeleteSelection,
} from "../../../../managers";

/**
 * Registers nested-block outdent behavior for Backspace at offset zero.
 *
 * @param reactEditor - Runtime receiving the keyboard binding.
 * @returns No value.
 */
export function registerBlockOutdent(reactEditor: ReactEditorExtensionApi): void {
  reactEditor.keyboard.register(
    {
      id: KEYBOARD_BINDING_IDS.blockOutdentAtStart,
      keys: BUILTIN_KEYMAP[KEYBOARD_BINDING_IDS.blockOutdentAtStart],
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
        "onOutdentAtStart",
        { ...context, inputRoot, inputRegistration },
        target,
      );
    },
  );
}
