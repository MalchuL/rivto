import {
  readEditorDOMSelection,
  restoreEditorDOMSelection,
  type RivtoEditorApi,
} from "../../internal";
import {
  firstKeyboardTarget,
  isEditableKeyboardEvent,
} from "./keyboard-selection";

/**
 * Applies one semantic indent or outdent binding.
 *
 * `indentPlugin` maps configurable shortcuts to this operation through the
 * shared KeyboardEvents registry. The first editor selection item supplies the command entry point; the
 * runtime expands that point to the complete normalized selection range. The
 * DOM event is used only to confirm that the shortcut originated in editable
 * page content or from a whole-block selection focused on the page root.
 * Selected roots then move as one Logseq-style structural group.
 */
export function applyIndentShortcut(
  editor: RivtoEditorApi,
  root: HTMLElement,
  event: KeyboardEvent,
  outdent: boolean,
): void {
    if (
      event.defaultPrevented ||
      event.isComposing
    ) return;

    const editable = isEditableKeyboardEvent(event);
    const nativeSelection = editable ? readEditorDOMSelection(root) : undefined;
    if (nativeSelection) editor.execute("selection.set", { selection: nativeSelection });
    const selection = nativeSelection ?? editor.selection.get();
    const target = firstKeyboardTarget(selection);
    if (!target) return;
    const blockSelectionAtRoot = event.target === root && target.item.type === "block";
    if (!editable && !blockSelectionAtRoot) return;

    event.preventDefault();
    if (outdent) editor.outdentBlock(target.blockId);
    else editor.indentBlock(target.blockId);

    // React may reparent every selected BlockView and cause the browser to emit
    // a transient empty selectionchange. Re-publish the selection captured
    // before the command, then resolve its text endpoints in the committed DOM.
    requestAnimationFrame(() => {
      editor.execute("selection.set", { selection });
      restoreEditorDOMSelection(root, selection);
    });
}
