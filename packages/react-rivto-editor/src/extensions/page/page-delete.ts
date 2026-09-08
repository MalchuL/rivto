/**
 * Owns forward Delete behavior at editable block boundaries. It preserves
 * ordinary forward merging while sharing the narrowly scoped empty-writing
 * removal used when a structural predecessor prevents a meaningful merge.
 *
 * @module
 */
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
  readKeyboardSelection,
  shouldDeleteSelection,
} from "../../managers";
import { navigationDomRoot } from "./outline-scope";
import { removeEmptyBlockAfterStructuralPredecessor } from "./page-backspace";

/** Merges the next visible editable block at a collapsed block-end caret. */
export function registerForwardBlockMerge(reactEditor: ReactEditor): void {
  const { editor } = reactEditor;
  reactEditor.keyboard.register({
    id: KEYBOARD_BINDING_IDS.blockMergeForward,
    keys: BUILTIN_KEYMAP[KEYBOARD_BINDING_IDS.blockMergeForward],
    when: ({ raw: event, blockId }) =>
      isEditableKeyboardEvent(event) &&
      !shouldDeleteSelection(readKeyboardSelection(reactEditor.selection, editor, blockId)),
  }, ({ root, blockId }) => {
    const target = firstKeyboardTarget(readKeyboardSelection(reactEditor.selection, editor, blockId));
    const block = target?.collapsed ? editor.blocks.getBlock(target.blockId) : undefined;
    if (!target?.collapsed || !block || target.offset !== block.content.length) return false;
    // A collapsed parent behaves as a visible leaf: Delete must not merge one
    // of its deliberately hidden descendants.
    if (reactEditor.blocks.hasListProps("collapse") && block.listProps.collapsed === true) return false;
    const scope = navigationDomRoot(root, block.id);
    if (removeEmptyBlockAfterStructuralPredecessor(reactEditor, scope, block.id)) return true;
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
