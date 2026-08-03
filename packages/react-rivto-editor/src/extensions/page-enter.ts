import { DEFAULT_BLOCK_TYPE } from "@chulane/rivto";
import type { ReactEditor } from "../types";
import {
  focusBlock,
} from "../managers";
import {
  firstKeyboardTarget,
  isEditableKeyboardEvent,
  shouldDeleteSelection,
} from "../managers";
import { BUILTIN_KEYMAP, KEYBOARD_BINDING_IDS } from "../managers";

/**
 * Installs outline block splitting for Page and Edgeless surfaces.
 *
 * The declarative `block.create` binding decides which key invokes this action.
 * The first selection item supplies the only insertion target,
 * so a multi-item selection never creates several blocks. Expanded text is
 * deleted first, a collapsed caret splits its block, and a whole-block item adds
 * one empty default writing block.
 * The new block becomes the first child when the source has children, or the
 * next sibling otherwise. Shift+Enter remains native plaintext input.
 */
export function registerBlockCreation(reactEditor: ReactEditor): void {
  const { editor } = reactEditor;
  reactEditor.keyboard.register({
    id: KEYBOARD_BINDING_IDS.blockCreate,
    keys: BUILTIN_KEYMAP[KEYBOARD_BINDING_IDS.blockCreate]!,
  }, ({ raw: event, root }) => {
    if (!isEditableKeyboardEvent(event)) return false;
    // Read the key event's native caret synchronously. A newly focused editor
    // can receive Enter before the browser's deferred selectionchange event.
    const nativeSelection = reactEditor.selection.readDOM();
    if (nativeSelection) editor.selection.set(nativeSelection);
    const selection = nativeSelection ?? editor.selection.get();
    const initialTarget = firstKeyboardTarget(selection);
    if (!initialTarget) return false;

    let nextBlockId = "";

    // Selection deletion, text splitting, insertion, and nesting share one CRDT
    // transaction, so Enter is one collaborative update and one undo step.
    editor.batchUpdates(() => {
      let target = initialTarget;
      if (target.item.type === "text" && shouldDeleteSelection(selection)) {
        editor.deleteSelection();
        const collapsed = firstKeyboardTarget(editor.selection.get());
        if (!collapsed?.collapsed) return;
        target = collapsed;
      }

      const block = editor.blocks.getBlock(target.blockId);
      if (!block) return;
      const isTextTarget = target.item.type === "text";
      const splitAt = isTextTarget
        ? Math.min(target.offset ?? 0, block.content.length)
        : block.content.length;
      if (isTextTarget) editor.blocks.updateBlock(block.id, { content: block.content.slice(0, splitAt) });
      nextBlockId = editor.blocks.insertBlock({
        type: DEFAULT_BLOCK_TYPE,
        content: isTextTarget ? block.content.slice(splitAt) : "",
      }, block.id);

      const edgelessRoot = editor.mode.get() === "edgeless" && editor.blocks.getParentId(block.id) === null;
      const childrenAreVisible = editor.mode.get() === "edgeless" || !block.collapsed;
      if (edgelessRoot || (block.children.length > 0 && childrenAreVisible)) {
        // Insertion initially creates a sibling directly after `block`.
        // Indenting makes it the last child; moving it to position zero then
        // gives Enter the requested first-child placement.
        editor.blocks.indentBlock(nextBlockId);
        editor.blocks.moveBlock(nextBlockId, null);
      }

      editor.selection.set([{
        type: "text",
        anchor: { blockId: nextBlockId, offset: 0 },
        head: { blockId: nextBlockId, offset: 0 },
      }]);
    });

    if (!nextBlockId) return false;
    requestAnimationFrame(() => focusBlock(root, nextBlockId, 0));
    return true;
  });
}
