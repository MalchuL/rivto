import type { ReactEditor } from "../../types";
import {
  BUILTIN_KEYMAP,
  findNextEditableBlock,
  focusBlock,
  KEYBOARD_BINDING_IDS,
} from "../../managers";
import {
  firstKeyboardTarget,
  isEditableKeyboardEvent,
  shouldDeleteSelection,
} from "../../managers";
import { navigationDomRoot } from "./outline-scope";

/** Merges the next visible editable block at a collapsed block-end caret. */
export function registerForwardBlockMerge(reactEditor: ReactEditor): void {
  const { editor } = reactEditor;
  reactEditor.keyboard.register({
    id: KEYBOARD_BINDING_IDS.blockMergeForward,
    keys: BUILTIN_KEYMAP[KEYBOARD_BINDING_IDS.blockMergeForward],
    when: ({ selection, raw: event }) =>
      !shouldDeleteSelection(selection) && isEditableKeyboardEvent(event),
  }, ({ root }) => {
    const target = firstKeyboardTarget(editor.selection.get());
    const block = target?.collapsed ? editor.blocks.getBlock(target.blockId) : undefined;
    if (!target?.collapsed || !block || target.offset !== block.content.length) return false;
    // A collapsed parent behaves as a visible leaf: Delete must not merge one
    // of its deliberately hidden descendants.
    if (block.collapsed) return false;
    const scope = navigationDomRoot(root, block.id);
    const next = findNextEditableBlock(scope, block.id);
    if (!next) return false;
    const joinOffset = editor.blocks.mergeBlocks(block.id, next.blockId);
    editor.selection.set([{
      type: "text",
      anchor: { blockId: block.id, offset: joinOffset },
      head: { blockId: block.id, offset: joinOffset },
    }]);
    requestAnimationFrame(() => focusBlock(root, block.id, joinOffset));
    return true;
  });
}
