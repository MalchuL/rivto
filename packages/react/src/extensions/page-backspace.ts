import { DEFAULT_BLOCK_TYPE } from "@chulane/rivto";
import type { ReactEditor } from "../types";
import { BUILTIN_KEYMAP, KEYBOARD_BINDING_IDS } from "../managers";
import {
  findParentBlock,
  findPreviousEditableBlock,
  findRenderedBlock,
  focusBlock,
} from "../managers";
import {
  firstKeyboardTarget,
  isEditableKeyboardEvent,
  shouldDeleteSelection,
} from "../managers";

/**
 * Outdents a nested block when Backspace is pressed at offset zero.
 *
 * This action is intentionally independent from merge and reset behavior.
 * Returning `false` when the structural preconditions do not match lets the
 * unified keyboard runtime try the next Backspace binding.
 */
export function registerBlockOutdent(reactEditor: ReactEditor): void {
  const { editor } = reactEditor;
  reactEditor.events.register({
    id: KEYBOARD_BINDING_IDS.blockOutdentAtStart,
    keys: BUILTIN_KEYMAP[KEYBOARD_BINDING_IDS.blockOutdentAtStart],
    mode: "block",
    when: ({ selection, raw: event }) =>
      !shouldDeleteSelection(selection) && isEditableKeyboardEvent(event),
  }, ({ root }) => {
    const target = firstKeyboardTarget(editor.selection.get());
    if (!target?.collapsed || target.offset !== 0) return false;
    const rendered = findRenderedBlock(root, target.blockId);
    if (!rendered || !findParentBlock(rendered)) return false;
    editor.outdentBlock(target.blockId);
    requestAnimationFrame(() => focusBlock(root, target.blockId, 0));
    return true;
  });
}

/**
 * Merges a root block into the previous visible editable block.
 *
 * Nested blocks are claimed by `BlockOutdentPlugin` first. If no previous
 * editable block exists this binding falls through to `EmptyBlockResetPlugin`
 * or to native contenteditable deletion.
 */
export function registerBackwardBlockMerge(reactEditor: ReactEditor): void {
  const { editor } = reactEditor;
  reactEditor.events.register({
    id: KEYBOARD_BINDING_IDS.blockMergeBackward,
    keys: BUILTIN_KEYMAP[KEYBOARD_BINDING_IDS.blockMergeBackward],
    mode: "block",
    when: ({ selection, raw: event }) =>
      !shouldDeleteSelection(selection) && isEditableKeyboardEvent(event),
  }, ({ root }) => {
    const target = firstKeyboardTarget(editor.selection.get());
    if (!target?.collapsed || target.offset !== 0) return false;
    const rendered = findRenderedBlock(root, target.blockId);
    if (rendered && findParentBlock(rendered)) return false;
    const previous = findPreviousEditableBlock(root, target.blockId);
    if (!previous) return false;
    const joinOffset = editor.mergeBlocks(previous.blockId, target.blockId);
    editor.selection.set([{
      type: "text",
      anchor: { blockId: previous.blockId, offset: joinOffset },
      head: { blockId: previous.blockId, offset: joinOffset },
    }]);
    requestAnimationFrame(() => focusBlock(root, previous.blockId, joinOffset));
    return true;
  });
}

/** Resets the first empty custom block to the default paragraph type. */
export function registerEmptyBlockReset(reactEditor: ReactEditor): void {
  const { editor } = reactEditor;
  reactEditor.events.register({
    id: KEYBOARD_BINDING_IDS.emptyBlockReset,
    keys: BUILTIN_KEYMAP[KEYBOARD_BINDING_IDS.emptyBlockReset],
    mode: "block",
    when: ({ selection, raw: event }) =>
      !shouldDeleteSelection(selection) && isEditableKeyboardEvent(event),
  }, ({ root }) => {
    const target = firstKeyboardTarget(editor.selection.get());
    if (!target?.collapsed || target.offset !== 0) return false;
    const block = editor.getBlock(target.blockId);
    if (!block || block.content !== "" || block.type === DEFAULT_BLOCK_TYPE) return false;
    if (findPreviousEditableBlock(root, block.id)) return false;
    editor.setBlockType(block.id, DEFAULT_BLOCK_TYPE);
    requestAnimationFrame(() => focusBlock(root, block.id, 0));
    return true;
  });
}
