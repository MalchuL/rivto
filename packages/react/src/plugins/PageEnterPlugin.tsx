import {
  DEFAULT_BLOCK_TYPE,
  readEditorDOMSelection,
  useEditor,
  useEditorEvent,
  useEditorRoot,
} from "../internal";
import {
  focusBlock,
} from "./utils/block-dom";
import {
  firstKeyboardTarget,
  isEditableKeyboardEvent,
  shouldDeleteSelection,
} from "./utils/keyboard-selection";

/**
 * Installs outline block splitting for Page and Edgeless surfaces.
 *
 * This plugin owns one delegated keydown listener and ignores every key except
 * unmodified Enter. The first selection item supplies the only insertion target,
 * so a multi-item selection never creates several blocks. Expanded text is
 * deleted first, a collapsed caret splits its block, and a whole-block item adds
 * one empty default writing block.
 * The new block becomes the first child when the source has children, or the
 * next sibling otherwise. Shift+Enter remains native plaintext input.
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

    if (!isEditableKeyboardEvent(event)) return;
    // Read the key event's native caret synchronously. A newly focused editor
    // can receive Enter before the browser's deferred selectionchange event.
    const nativeSelection = readEditorDOMSelection(root);
    if (nativeSelection) editor.execute("selection.set", { selection: nativeSelection });
    const selection = nativeSelection ?? editor.selection.get();
    const initialTarget = firstKeyboardTarget(selection);
    if (!initialTarget || initialTarget.item.type === "edgeless") return;

    event.preventDefault();
    let nextBlockId = "";

    // Selection deletion, text splitting, insertion, and nesting share one CRDT
    // transaction, so Enter is one collaborative update and one undo step.
    editor.document.transact(() => {
      let target = initialTarget;
      if (target.item.type === "text" && shouldDeleteSelection(selection)) {
        editor.deleteSelection();
        const collapsed = firstKeyboardTarget(editor.selection.get());
        if (!collapsed?.collapsed) return;
        target = collapsed;
      }

      const block = editor.getBlock(target.blockId);
      if (!block) return;
      const isTextTarget = target.item.type === "text";
      const splitAt = isTextTarget
        ? Math.min(target.offset ?? 0, block.content.length)
        : block.content.length;
      if (isTextTarget) editor.updateBlock(block.id, { content: block.content.slice(0, splitAt) });
      nextBlockId = editor.insertBlock({
        type: DEFAULT_BLOCK_TYPE,
        content: isTextTarget ? block.content.slice(splitAt) : "",
      }, block.id);

      const childrenAreVisible = editor.mode.get() === "edgeless" || !editor.getBlockCollapsed(block.id);
      if (block.children.length > 0 && childrenAreVisible) {
        // Insertion initially creates a sibling directly after `block`.
        // Indenting makes it the last child; moving it to position zero then
        // gives Enter the requested first-child placement.
        editor.indentBlock(nextBlockId);
        editor.moveBlock(nextBlockId, null);
      } else if (editor.mode.get() === "edgeless" && editor.getBlocks().some((rootBlock) => rootBlock.id === block.id)) {
        // A split root becomes another canvas object near its source instead
        // of overlapping the core's default coordinates.
        editor.setBlockLayout(nextBlockId, {
          x: (block.layout?.x ?? 40) + 24,
          y: (block.layout?.y ?? 40) + 24,
        });
      }

      editor.execute("selection.set", { selection: [{
        type: "text",
        anchor: { blockId: nextBlockId, offset: 0 },
        head: { blockId: nextBlockId, offset: 0 },
      }] });
    });

    if (nextBlockId) requestAnimationFrame(() => focusBlock(root, nextBlockId, 0));
  });

  return null;
}
