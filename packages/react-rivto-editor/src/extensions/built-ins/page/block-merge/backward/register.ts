import type { ReactEditorExtensionApi } from "../../../../../editor/types";
/** Keyboard registration for backward block merging at a content boundary. */
import { createBlockSnapshotContext } from "../../../../../block-behaviors/utils/context";
import {
  BUILTIN_KEYMAP,
  firstKeyboardTarget,
  KEYBOARD_BINDING_IDS,
  readKeyboardSelection,
  shouldDeleteSelection,
} from "../../../../../managers";

/**
 * Registers backward merge behavior for Backspace at offset zero.
 *
 * @param reactEditor - Runtime receiving the keyboard binding.
 * @returns No value.
 */
export function registerBackwardBlockMerge(reactEditor: ReactEditorExtensionApi): void {
  reactEditor.keyboard.register(
    {
      id: KEYBOARD_BINDING_IDS.blockMergeBackward,
      keys: BUILTIN_KEYMAP[KEYBOARD_BINDING_IDS.blockMergeBackward],
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
        "onMergeBackward",
        { ...context, inputRoot, inputRegistration },
        target,
      );
    },
  );
}
