import {
  useEditor,
  useEditorEvent,
  useEditorRoot,
} from "@chulane/rivto";
import {
  findParentBlock,
  findPreviousEditableBlock,
  findRenderedBlock,
  focusBlock,
} from "./block-dom";
import {
  firstKeyboardTarget,
  focusSelectionCaret,
  isEditableKeyboardEvent,
  shouldDeleteSelection,
} from "./keyboard-selection";

/**
 * Installs page-specific Backspace behavior at the start of a block.
 *
 * Expanded text or whole-block selections are deleted through the atomic
 * selection command. For one collapsed caret at offset zero, nested blocks
 * outdent and root blocks merge into the previous visible editable block. A
 * first empty non-paragraph becomes a paragraph; an empty paragraph remains as
 * the safe final editing target.
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

    if (!isEditableKeyboardEvent(event)) return;
    const selection = editor.selection.get();
    if (shouldDeleteSelection(selection)) {
      event.preventDefault();
      editor.deleteSelection();
      requestAnimationFrame(() => focusSelectionCaret(root, editor));
      return;
    }

    const target = firstKeyboardTarget(selection);
    if (!target?.collapsed || target.offset !== 0) return;

    const block = editor.getBlock(target.blockId);
    if (!block) return;

    const renderedBlock = findRenderedBlock(root, block.id);
    if (renderedBlock && findParentBlock(renderedBlock)) {
      event.preventDefault();
      editor.outdentBlock(block.id);
      requestAnimationFrame(() => focusBlock(root, block.id, 0));
      return;
    }

    const previous = findPreviousEditableBlock(root, block.id);
    if (previous) {
      event.preventDefault();
      const joinOffset = editor.mergeBlocks(previous.blockId, block.id);
      editor.execute("selection.set", { selection: [{
        type: "text",
        anchor: { blockId: previous.blockId, offset: joinOffset },
        head: { blockId: previous.blockId, offset: joinOffset },
      }] });
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
