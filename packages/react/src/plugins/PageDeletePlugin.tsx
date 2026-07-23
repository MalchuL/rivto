import {
  useEditor,
  useEditorEvent,
  useEditorRoot,
} from "../internal";
import {
  findNextEditableBlock,
  focusBlock,
} from "./utils/block-dom";
import {
  firstKeyboardTarget,
  focusSelectionCaret,
  isEditableKeyboardEvent,
  shouldDeleteSelection,
} from "./utils/keyboard-selection";

/**
 * Installs selection-aware forward Delete behavior for the page surface.
 *
 * Any expanded or whole-block selection is deleted atomically. A collapsed
 * caret inside text remains native browser behavior. At the end of a block,
 * Delete merges the next visible editable block into the selected block and
 * publishes the resulting zero-length caret through SelectionManager.
 */
export interface PageDeletePluginProps {
  readonly behavior?: "selection" | "merge";
}

export function PageDeletePlugin({ behavior }: PageDeletePluginProps = {}) {
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
      !root
    ) return;

    const selection = editor.selection.get();
    // A block-only selection is owned by the focusable page root rather than a
    // contenteditable. Controls such as collapse toggles cannot enter this path
    // because they, not the root, remain the active element.
    const rootBlockSelection = root.ownerDocument.activeElement === root &&
      selection.some((item) => item.type === "block");
    if (!rootBlockSelection && !isEditableKeyboardEvent(event)) return;
    if (shouldDeleteSelection(selection)) {
      if (behavior === "merge") return;
      event.preventDefault();
      editor.deleteSelection();
      requestAnimationFrame(() => focusSelectionCaret(root, editor));
      return;
    }
    if (behavior === "selection") return;

    const target = firstKeyboardTarget(selection);
    const block = target?.collapsed ? editor.getBlock(target.blockId) : undefined;
    if (!target?.collapsed || !block || target.offset !== block.content.length) return;

    // A collapsed parent is a visible leaf. Its hidden first child must not be
    // merged or skipped over by forward deletion, matching Logseq's behavior.
    if (editor.getBlockCollapsed(block.id)) return;

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
