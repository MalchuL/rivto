import type { ReactEditorExtensionApi } from "../../../editor/types";
import { createBlockSnapshotContext } from "../../../block-behaviors/utils/context";
import {
  BUILTIN_KEYMAP,
  firstKeyboardTarget,
  KEYBOARD_BINDING_IDS,
  readKeyboardSelection,
  shouldDeleteSelection,
} from "../../../managers";

/** Keyboard registration borrowed by the built-in block boundary shortcuts. */
export interface BlockBoundaryShortcutEditor {
  readonly keyboard: Pick<ReactEditorExtensionApi["keyboard"], "register">;
}

const bindingIds = {
  onMergeBackward: KEYBOARD_BINDING_IDS.blockMergeBackward,
  onMergeForward: KEYBOARD_BINDING_IDS.blockMergeForward,
  onOutdentAtStart: KEYBOARD_BINDING_IDS.blockOutdentAtStart,
  onResetEmpty: KEYBOARD_BINDING_IDS.emptyBlockReset,
};

/**
 * Routes a Page shortcut to the block behavior at a collapsed caret boundary.
 *
 * Forward merge requires the end of the current block. The Backspace actions
 * require offset zero. Both eligibility and dispatch read the live selection
 * because an earlier binding can replace the occurrence or move the caret.
 *
 * @param reactEditor - Runtime providing the editor-owned keyboard registration.
 * @param action - Behavior hook whose binding ID and default keys are registered.
 * @returns The binding is installed for the current extension lifetime.
 * @throws Propagates keyboard registration failures.
 */
export function registerBlockBoundaryShortcut(
  reactEditor: BlockBoundaryShortcutEditor,
  action: keyof typeof bindingIds,
): void {
  const id = bindingIds[action];
  reactEditor.keyboard.register(
    {
      id,
      keys: BUILTIN_KEYMAP[id],
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
      if (!target?.collapsed) {
        return false;
      }
      if (action === "onMergeForward") {
        const block = reactPanel.blocks.getBlockNode(target.blockId);
        if (!block || target.offset !== block.content.length) {
          return false;
        }
      } else if (target.offset !== 0) {
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
        action,
        { ...context, inputRoot, inputRegistration },
        target,
      );
    },
  );
}
