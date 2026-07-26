import { useEditor, useEditorRoot, useKeyboardEvent } from "../hooks";
import { BUILTIN_KEYMAP, KEYBOARD_BINDING_IDS } from "../events/keymap";
import { findNextEditableBlock, focusBlock } from "../events/utils/dom/block-dom";
import {
  firstKeyboardTarget,
  isEditableKeyboardEvent,
  shouldDeleteSelection,
} from "../events/utils/keyboard/selection";

/** Merges the next visible editable block at a collapsed block-end caret. */
export function ForwardBlockMergePlugin() {
  const editor = useEditor();
  const { element: root } = useEditorRoot();

  useKeyboardEvent({
    id: KEYBOARD_BINDING_IDS.blockMergeForward,
    keys: BUILTIN_KEYMAP[KEYBOARD_BINDING_IDS.blockMergeForward],
    mode: "block",
    when: ({ selection, event }) =>
      !shouldDeleteSelection(selection) && isEditableKeyboardEvent(event),
  }, () => {
    if (!root) return false;
    const target = firstKeyboardTarget(editor.selection.get());
    const block = target?.collapsed ? editor.getBlock(target.blockId) : undefined;
    if (!target?.collapsed || !block || target.offset !== block.content.length) return false;
    // A collapsed parent behaves as a visible leaf: Delete must not merge one
    // of its deliberately hidden descendants.
    if (editor.getBlockCollapsed(block.id)) return false;
    const next = findNextEditableBlock(root, block.id);
    if (!next) return false;
    const joinOffset = editor.mergeBlocks(block.id, next.blockId);
    editor.execute("selection.set", { selection: [{
      type: "text",
      anchor: { blockId: block.id, offset: joinOffset },
      head: { blockId: block.id, offset: joinOffset },
    }] });
    requestAnimationFrame(() => focusBlock(root, block.id, joinOffset));
    return true;
  });

  return null;
}
