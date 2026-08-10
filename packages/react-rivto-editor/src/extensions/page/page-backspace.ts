import { DEFAULT_BLOCK_TYPE } from "@chulane/rivto";
import type { ReactEditor } from "../../types";
import { BUILTIN_KEYMAP, KEYBOARD_BINDING_IDS } from "../../managers";
import {
  findParentBlock,
  findPreviousEditableBlock,
  findRenderedBlock,
  focusBlock,
} from "../../managers";
import {
  firstKeyboardTarget,
  isEditableKeyboardEvent,
  shouldDeleteSelection,
} from "../../managers";
import { navigationDomRoot } from "./outline-scope";

/**
 * Outdents a nested block when Backspace is pressed at offset zero.
 *
 * This action is intentionally independent from merge and reset behavior.
 * Returning `false` when the structural preconditions do not match lets the
 * keyboard runtime try the next Backspace binding.
 */
export function registerBlockOutdent(reactEditor: ReactEditor): void {
  const { editor } = reactEditor;
  reactEditor.keyboard.register({
    id: KEYBOARD_BINDING_IDS.blockOutdentAtStart,
    keys: BUILTIN_KEYMAP[KEYBOARD_BINDING_IDS.blockOutdentAtStart],
    when: ({ selection, raw: event }) =>
      !shouldDeleteSelection(selection) && isEditableKeyboardEvent(event),
  }, ({ root }) => {
    const target = firstKeyboardTarget(editor.selection.get());
    if (!target?.collapsed || target.offset !== 0) return false;
    const rendered = findRenderedBlock(root, target.blockId);
    if (!rendered || !findParentBlock(rendered)) return false;
    editor.blocks.outdentBlock(target.blockId);
    requestAnimationFrame(() => focusBlock(root, target.blockId, 0));
    return true;
  });
}

/**
 * Merges a root block into the previous visible editable block.
 *
 * Nested blocks are claimed by `BlockOutdentPlugin` first. If no previous
 * editable block exists this binding falls through to `EmptyBlockResetPlugin`
 * or to native contenteditable deletion. Edgeless merges stay inside one card.
 */
export function registerBackwardBlockMerge(reactEditor: ReactEditor): void {
  const { editor } = reactEditor;
  reactEditor.keyboard.register({
    id: KEYBOARD_BINDING_IDS.blockMergeBackward,
    keys: BUILTIN_KEYMAP[KEYBOARD_BINDING_IDS.blockMergeBackward],
    when: ({ selection, raw: event }) =>
      !shouldDeleteSelection(selection) && isEditableKeyboardEvent(event),
  }, ({ root }) => {
    const target = firstKeyboardTarget(editor.selection.get());
    if (!target?.collapsed || target.offset !== 0) return false;
    const rendered = findRenderedBlock(root, target.blockId);
    if (rendered && findParentBlock(rendered)) return false;
    const scope = navigationDomRoot(root, target.blockId);
    const previous = findPreviousEditableBlock(scope, target.blockId);
    if (!previous) return false;
    const joinOffset = editor.blocks.mergeBlocks(previous.blockId, target.blockId);
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
  const { editor, isEmptyBlock } = reactEditor;
  reactEditor.keyboard.register({
    id: KEYBOARD_BINDING_IDS.emptyBlockReset,
    keys: BUILTIN_KEYMAP[KEYBOARD_BINDING_IDS.emptyBlockReset],
    when: ({ selection, raw: event }) =>
      !shouldDeleteSelection(selection) && isEditableKeyboardEvent(event),
  }, ({ root }) => {
    const target = firstKeyboardTarget(editor.selection.get());
    if (!target?.collapsed || target.offset !== 0) return false;
    const block = editor.blocks.getBlock(target.blockId);
    // Blocks already considered empty by the host policy skip type reset.
    if (!block || block.content !== "" || isEmptyBlock(block)) return false;
    const scope = navigationDomRoot(root, block.id);
    if (findPreviousEditableBlock(scope, block.id)) return false;
    editor.blocks.setBlockType(block.id, DEFAULT_BLOCK_TYPE);
    requestAnimationFrame(() => focusBlock(root, block.id, 0));
    return true;
  });
}
