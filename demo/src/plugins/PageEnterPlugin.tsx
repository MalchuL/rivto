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

/** List-item types that continue the same list when Enter splits their text. */
const LIST_ITEM_TYPES = new Set([
  "bulletListItem",
  "numberedListItem",
  "checkListItem",
]);

/**
 * Installs page-specific Enter block splitting.
 *
 * This plugin owns one delegated keydown listener and ignores every key except
 * unmodified Enter. It splits at a collapsed caret, continues list-item types,
 * and otherwise creates a paragraph. The new block becomes the first child when
 * the source already has children, or the next sibling when it does not.
 * Shift+Enter remains native plaintext input.
 */
export function PageEnterPlugin() {
  const editor = useEditor();
  const { element: root } = useEditorRoot();

  useEditorEvent("keydown", (event) => {
    if (
      event.defaultPrevented ||
      event.isComposing ||
      event.key !== "Enter" ||
      event.shiftKey ||
      event.altKey ||
      event.ctrlKey ||
      event.metaKey ||
      !root
    ) return;

    const origin = findBlockFromEvent(event);
    if (!origin) return;

    const caretOffset = getCaretOffset(origin.content);
    const block = editor.getBlock(origin.blockId);
    if (caretOffset === null || !block) return;

    event.preventDefault();
    const content = origin.content.textContent ?? "";
    const splitAt = Math.min(caretOffset, content.length);
    const nextType = LIST_ITEM_TYPES.has(block.type) ? block.type : "paragraph";
    let nextBlockId = "";

    // Both mutations share one outer CRDT transaction, so observers and undo
    // history see one semantic Enter action rather than a partial intermediate.
    editor.document.transact(() => {
      editor.updateBlock(block.id, { content: content.slice(0, splitAt) });
      nextBlockId = editor.insertBlock({
        type: nextType,
        content: content.slice(splitAt),
      }, block.id);

      if (block.children.length > 0) {
        // Insertion initially creates a sibling directly after `block`.
        // Indenting makes it the last child; moving it to position zero then
        // gives Enter the requested first-child placement.
        editor.indentBlock(nextBlockId);
        editor.moveBlock(nextBlockId, null);
      }
    });

    requestAnimationFrame(() => focusBlock(root, nextBlockId, 0));
  });

  return null;
}
