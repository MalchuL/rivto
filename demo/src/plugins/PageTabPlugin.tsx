import {
  useEditor,
  useEditorEvent,
  useEditorRoot,
  restoreEditorDOMSelection,
} from "@chulane/rivto";
import {
  firstKeyboardTarget,
  isEditableKeyboardEvent,
} from "./keyboard-selection";

/**
 * Installs page-specific Tab and Shift+Tab indentation.
 *
 * This plugin owns one delegated keydown listener and ignores every key except
 * Tab. The first editor selection item supplies the command entry point; the
 * runtime expands that point to the complete normalized selection range. The
 * DOM event is used only to confirm that the shortcut originated in editable
 * page content. Selected roots then move as one Logseq-style structural group.
 */
export function PageTabPlugin() {
  const editor = useEditor();
  const { element: root } = useEditorRoot();

  useEditorEvent("keydown", (event) => {
    if (
      event.defaultPrevented ||
      event.isComposing ||
      event.key !== "Tab" ||
      !root
    ) return;

    if (!isEditableKeyboardEvent(event)) return;
    const selection = editor.selection.get();
    const target = firstKeyboardTarget(selection);
    if (!target) return;

    event.preventDefault();
    if (event.shiftKey) editor.outdentBlock(target.blockId);
    else editor.indentBlock(target.blockId);

    // React may reparent every selected BlockView and cause the browser to emit
    // a transient empty selectionchange. Re-publish the selection captured
    // before the command, then resolve its text endpoints in the committed DOM.
    requestAnimationFrame(() => {
      editor.execute("selection.set", { selection });
      restoreEditorDOMSelection(root, selection);
    });
  });

  return null;
}
