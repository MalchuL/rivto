import { DEFAULT_BLOCK_TYPE, isNumberedListType } from "@chulane/rivto";
import type { ReactEditor } from "../../types";
import {
  focusBlock,
} from "../../managers";
import {
  firstKeyboardTarget,
  isEditableKeyboardEvent,
  shouldDeleteSelection,
} from "../../managers";
import { BUILTIN_KEYMAP, KEYBOARD_BINDING_IDS } from "../../managers";

/**
 * Installs outline block splitting for Page and Edgeless surfaces.
 *
 * The declarative `block.create` binding decides which key invokes this action.
 * The first selection item supplies the only insertion target,
 * so a multi-item selection never creates several blocks. Expanded text is
 * deleted first, a collapsed caret splits its block, and a whole-block item adds
 * one empty default writing block.
 * An empty default nested block outdents to a document root on Enter.
 * The new block becomes the first child when the source has visible children,
 * or the next sibling otherwise. Edgeless uses the same placement rule and
 * expands the owning block-element range for a new root. Shift+Enter remains
 * native plaintext input.
 */
export function registerBlockCreation(reactEditor: ReactEditor): void {
  const { editor, isEmptyBlock } = reactEditor;
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

      // Empty nested writing blocks outdent instead of inserting another blank row.
      // Keep outdenting in this keypress until the block is a document root.
      if (isEmptyBlock(block) && editor.blocks.getParentId(block.id)) {
        while (editor.blocks.getParentId(block.id)) {
          editor.blocks.outdentBlock(block.id);
        }
        nextBlockId = block.id;
        editor.selection.set([{
          type: "text",
          anchor: { blockId: nextBlockId, offset: 0 },
          head: { blockId: nextBlockId, offset: 0 },
        }]);
        return;
      }

      if (isEmptyBlock(block) && block.listProps.type !== "list") {
        editor.blocks.updateBlock(block.id, { listProps: { type: "list", checked: false } });
        nextBlockId = block.id;
        return;
      }
      const isTextTarget = target.item.type === "text";
      const splitAt = isTextTarget
        ? Math.min(target.offset ?? 0, block.content.length)
        : block.content.length;
      if (isTextTarget) editor.blocks.updateBlock(block.id, { content: block.content.slice(0, splitAt) });
      nextBlockId = editor.blocks.insertBlock({
        type: DEFAULT_BLOCK_TYPE,
        listProps: {
          type: block.listProps.type === "checkbox"
            ? "checkbox"
            : isNumberedListType(block.listProps.type) ? "numbered_list" : "list",
          checked: false,
        },
        content: isTextTarget ? block.content.slice(splitAt) : "",
      }, block.id);

      if (block.children.length > 0 && !block.collapsed) {
        // Insertion initially creates a sibling directly after `block`.
        // Indenting makes it the last child; moving it to position zero then
        // gives Enter the requested first-child placement.
        editor.blocks.indentBlock(nextBlockId);
        editor.blocks.moveBlock(nextBlockId, null);
      } else if (editor.mode.get() === "edgeless" && editor.blocks.getParentId(block.id) === null) {
        // Include the new root immediately; the derived reconciler would repair
        // this endpoint next microtask, but doing it here avoids one stale render.
        const element = editor.elements.getElements().find((candidate) =>
          candidate.type === "block" && candidate.props.endBlockId === block.id,
        );
        if (element) editor.elements.updateElement(element.id, { props: { endBlockId: nextBlockId } });
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
