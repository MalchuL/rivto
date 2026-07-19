import {
  useEditor,
  useEditorEvent,
  useEditorRoot,
} from "@chulane/rivto";
import {
  findBlockFromEvent,
  findParentBlock,
  findPreviousEditableBlock,
  focusBlock,
  getCaretOffset,
} from "./block-dom";

/**
 * Installs page-specific Backspace behavior at the start of a block.
 *
 * Nested blocks outdent first. Root blocks merge into the immediately previous
 * visible editable block through one core transaction, preserving descendants
 * and restoring the caret at the text join. A first empty non-paragraph becomes
 * a paragraph, while an empty paragraph remains as the document's safe final
 * editing target.
 */
export function PageBackspacePlugin() {
  const editor = useEditor();
  const { element: root } = useEditorRoot();

  useEditorEvent("keydown", (event) => {
    if (
      event.defaultPrevented ||
      event.isComposing ||
      event.key !== "Backspace" ||
      event.shiftKey ||
      event.altKey ||
      event.ctrlKey ||
      event.metaKey ||
      !root
    ) return;

    const origin = findBlockFromEvent(event);
    if (!origin || getCaretOffset(origin.content) !== 0) return;

    const block = editor.getBlock(origin.blockId);
    if (!block) return;

    if (findParentBlock(origin.block)) {
      event.preventDefault();
      editor.outdentBlock(block.id);
      requestAnimationFrame(() => focusBlock(root, block.id, 0));
      return;
    }

    const previous = findPreviousEditableBlock(root, block.id);
    if (previous) {
      event.preventDefault();
      const joinOffset = editor.mergeBlocks(previous.blockId, block.id);
      requestAnimationFrame(() => focusBlock(root, previous.blockId, joinOffset));
      return;
    }

    // The first block has nowhere to merge. Empty structural types become a
    // paragraph; an empty paragraph is retained instead of deleting the final
    // place where the user can continue typing.
    if (block.content === "") {
      event.preventDefault();
      if (block.type !== "paragraph") editor.setBlockType(block.id, "paragraph");
      requestAnimationFrame(() => focusBlock(root, block.id, 0));
    }
  });

  return null;
}
