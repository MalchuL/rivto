import {
  useEditor,
  useEditorEvent,
  useEditorRoot,
} from "@chulane/rivto";
import {
  findNextEditableBlock,
  focusBlock,
} from "./block-dom";
import {
  firstKeyboardTarget,
  focusSelectionCaret,
  isEditableKeyboardEvent,
  shouldDeleteSelection,
} from "./keyboard-selection";

/**
 * Installs selection-aware forward Delete behavior for the page surface.
 *
 * Any expanded or whole-block selection is deleted atomically. A collapsed
 * caret inside text remains native browser behavior. At the end of a block,
 * Delete merges the next visible editable block into the selected block and
 * publishes the resulting zero-length caret through SelectionManager.
 */
export function PageDeletePlugin() {
  const editor = useEditor();
  const { element: root } = useEditorRoot();

  useEditorEvent("keydown", (event) => {
    if (
      event.defaultPrevented ||
      event.isComposing ||
      event.key !== "Delete" ||
      event.shiftKey ||
      event.altKey ||
      event.ctrlKey ||
      event.metaKey ||
      !root ||
      !isEditableKeyboardEvent(event)
    ) return;

    const selection = editor.selection.get();
    if (shouldDeleteSelection(selection)) {
      event.preventDefault();
      editor.deleteSelection();
      requestAnimationFrame(() => focusSelectionCaret(root, editor));
      return;
    }

    const target = firstKeyboardTarget(selection);
    const block = target?.collapsed ? editor.getBlock(target.blockId) : undefined;
    if (!target?.collapsed || !block || target.offset !== block.content.length) return;

    const next = findNextEditableBlock(root, block.id);
    if (!next) return;

    event.preventDefault();
    const joinOffset = editor.mergeBlocks(block.id, next.blockId);
    editor.execute("selection.set", { selection: [{
      type: "text",
      anchor: { blockId: block.id, offset: joinOffset },
      head: { blockId: block.id, offset: joinOffset },
    }] });
    requestAnimationFrame(() => focusBlock(root, block.id, joinOffset));
  });

  return null;
}
