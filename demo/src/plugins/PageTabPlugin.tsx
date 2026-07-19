import {
  useEditor,
  useEditorEvent,
  useEditorRoot,
} from "@chulane/rivto";
import {
  findBlockFromEvent,
  focusBlock,
  getCaretOffset,
} from "./block-dom";

/**
 * Installs page-specific Tab and Shift+Tab indentation.
 *
 * This plugin owns one delegated keydown listener and ignores every key except
 * Tab. It resolves the editable block from stable DOM markers, invokes the
 * existing tree commands, and restores focus after React moves the block into a
 * different nesting container.
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

    const origin = findBlockFromEvent(event);
    if (!origin) return;

    const caretOffset = getCaretOffset(origin.content) ?? 0;
    event.preventDefault();
    if (event.shiftKey) editor.outdentBlock(origin.blockId);
    else editor.indentBlock(origin.blockId);

    // Moving between nesting containers can remount the editable element.
    // Wait for React to commit the new tree, then restore focus and caret.
    requestAnimationFrame(() => focusBlock(root, origin.blockId, caretOffset));
  });

  return null;
}
