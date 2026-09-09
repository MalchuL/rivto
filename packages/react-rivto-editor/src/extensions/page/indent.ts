/**
 * Editor interaction contracts and operations. Browser editing context is separate from core whole-block selection; document mutations use core managers.
 */
import type { RivtoEditorApi as Editor } from "@chulane/rivto";
import type { SelectionCapability } from "../../capabilities";
import {
  firstKeyboardTarget,
  isEditableKeyboardEvent,
  type KeyboardSelectionTarget,
} from "../../managers";

/**
 * Applies one semantic indent or outdent binding.
 *
 * `indentExtension` maps configurable shortcuts to this operation through the
 * keyboard registry. Whole-block selections indent or outdent every selected
 * ID as one group. A text caret indents only the focused block.
 * The DOM event is used only to confirm that the shortcut originated in editable
 * page content or from a whole-block selection focused on the page root.
 */
export function applyIndentShortcut(
  editor: Editor,
  selectionManager: SelectionCapability,
  root: HTMLElement,
  event: KeyboardEvent,
  outdent: boolean,
): boolean {
    const editable = isEditableKeyboardEvent(event);
    const nativeSelection = editable ? selectionManager.readDOM() : undefined;
    if (nativeSelection) selectionManager.set(nativeSelection);
    const selection = nativeSelection ?? selectionManager.get();
    const target = firstKeyboardTarget(selection);
    if (!target) return false;
    const blockSelectionAtRoot = event.target === root && target.item.type === "block";
    if (!editable && !blockSelectionAtRoot) return false;

    if (outdent) editor.blocks.outdentBlocks(indentTargetIds(target));
    else editor.blocks.indentBlocks(indentTargetIds(target));

    // React may reparent every selected BlockView and cause the browser to emit
    // a transient empty selectionchange. Re-publish the selection captured
    // before the command, then resolve its text endpoints in the committed DOM.
    requestAnimationFrame(() => {
      selectionManager.set(selection);
      selectionManager.restoreDOM(selection);
    });
    return true;
}

/**
 * Resolves the block identifiers a Tab or Shift+Tab shortcut should move.
 *
 * @param target - First keyboard selection item that qualified the shortcut.
 * @returns Whole-block IDs, or only the caret block for a text range.
 */
function indentTargetIds(target: KeyboardSelectionTarget): string[] {
  return target.item.type === "block" ? [...target.item.blockIds] : [target.blockId];
}
