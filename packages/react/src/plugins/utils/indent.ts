import type { RivtoEditorApi } from "@chulane/rivto";
import type { ReactSelectionManager } from "../../managers";
import {
  firstKeyboardTarget,
  isEditableKeyboardEvent,
} from "../../managers";

/**
 * Applies one semantic indent or outdent binding.
 *
 * `indentPlugin` maps configurable shortcuts to this operation through the
 * unified keyboard event registry. The first editor selection item supplies the command entry point; the
 * runtime expands that point to the complete normalized selection range. The
 * DOM event is used only to confirm that the shortcut originated in editable
 * page content or from a whole-block selection focused on the page root.
 * Selected roots then move as one Logseq-style structural group.
 */
export function applyIndentShortcut(
  editor: RivtoEditorApi,
  selectionManager: ReactSelectionManager,
  root: HTMLElement,
  event: KeyboardEvent,
  outdent: boolean,
): boolean {
    const editable = isEditableKeyboardEvent(event);
    const nativeSelection = editable ? selectionManager.readDOM() : undefined;
    if (nativeSelection) editor.selection.set(nativeSelection);
    const selection = nativeSelection ?? editor.selection.get();
    const target = firstKeyboardTarget(selection);
    if (!target) return false;
    const blockSelectionAtRoot = event.target === root && target.item.type === "block";
    if (!editable && !blockSelectionAtRoot) return false;

    if (outdent) editor.outdentBlock(target.blockId);
    else editor.indentBlock(target.blockId);

    // React may reparent every selected BlockView and cause the browser to emit
    // a transient empty selectionchange. Re-publish the selection captured
    // before the command, then resolve its text endpoints in the committed DOM.
    requestAnimationFrame(() => {
      editor.selection.set(selection);
      selectionManager.restoreDOM(selection);
    });
    return true;
}
