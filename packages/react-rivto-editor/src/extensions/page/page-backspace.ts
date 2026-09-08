/**
 * Owns page-style Backspace behavior at block boundaries and the shared empty
 * writing-block removal used by both deletion keys. Nested blocks preserve
 * outdent precedence; root empty blocks may be removed only when their
 * immediate predecessor is structurally non-editable.
 *
 * @module
 */
import type { ReactEditor } from "../../types";
import {
  BLOCK_CONTENT_SELECTOR,
  BLOCK_ID_ATTRIBUTE,
  BLOCK_ID_SELECTOR,
} from "../../constants";
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
  readKeyboardSelection,
  shouldDeleteSelection,
} from "../../managers";
import { navigationDomRoot } from "./outline-scope";

/** Returns true when a BlockView directly owns an editable content host. */
function hasOwnedEditableContent(block: HTMLElement): boolean {
  return Array.from(block.querySelectorAll<HTMLElement>(BLOCK_CONTENT_SELECTOR))
    .some((content) => content.closest(BLOCK_ID_SELECTOR) === block);
}

/** Resolves the current BlockView's immediately preceding sibling BlockView. */
function previousSiblingBlock(
  root: HTMLElement,
  blockId: string,
): { readonly element: HTMLElement; readonly id: string } | undefined {
  const current = findRenderedBlock(root, blockId);
  const previous = current?.previousElementSibling;
  if (!(previous instanceof HTMLElement) || !previous.matches(BLOCK_ID_SELECTOR)) return;
  const id = previous.getAttribute(BLOCK_ID_ATTRIBUTE);
  return id ? { element: previous, id } : undefined;
}

/**
 * Removes a root empty writing block after a non-text-editable sibling.
 *
 * A first child is outdented before removal. Core outdent semantics make that
 * child adopt its later siblings, so the empty parent is replaced without
 * flattening or recreating the surviving subtree. The complete transformation
 * and resulting predecessor selection share one undo item.
 *
 * @param reactEditor - Runtime owning host emptiness policy and block rendering.
 * @param root - Active page surface or edgeless card DOM scope.
 * @param blockId - Collapsed editable block addressed by the key event.
 * @returns True when the empty block was removed and the key was claimed.
 */
export function removeEmptyBlockAfterStructuralPredecessor(
  reactEditor: ReactEditor,
  root: HTMLElement,
  blockId: string,
): boolean {
  const { editor, isEmptyBlock } = reactEditor;
  const block = editor.blocks.getBlock(blockId);
  if (
    !block ||
    !isEmptyBlock(block) ||
    block.listProps.collapsed === true ||
    editor.blocks.getParentId(block.id) !== null
  ) return false;

  const previous = previousSiblingBlock(root, block.id);
  if (!previous || hasOwnedEditableContent(previous.element)) return false;

  editor.batchUpdates(() => {
    const firstChildId = block.children[0]?.id;
    if (firstChildId) editor.blocks.outdentBlock(firstChildId);
    editor.blocks.removeBlock(block.id);
    editor.selection.set([{
      type: "block",
      blockIds: [previous.id],
      anchorBlockId: previous.id,
      focusBlockId: previous.id,
    }]);
  });
  root.ownerDocument.getSelection()?.removeAllRanges();
  root.focus({ preventScroll: true });
  return true;
}

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
    when: ({ raw: event, blockId }) =>
      isEditableKeyboardEvent(event) &&
      !shouldDeleteSelection(readKeyboardSelection(reactEditor.selection, editor, blockId)),
  }, ({ root, blockId }) => {
    const target = firstKeyboardTarget(readKeyboardSelection(reactEditor.selection, editor, blockId));
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
 * editable block exists, an empty writing block after a structural sibling is
 * removed; other cases fall through to `EmptyBlockResetPlugin` or native
 * contenteditable deletion. Edgeless behavior stays inside one card.
 */
export function registerBackwardBlockMerge(reactEditor: ReactEditor): void {
  const { editor } = reactEditor;
  reactEditor.keyboard.register({
    id: KEYBOARD_BINDING_IDS.blockMergeBackward,
    keys: BUILTIN_KEYMAP[KEYBOARD_BINDING_IDS.blockMergeBackward],
    when: ({ raw: event, blockId }) =>
      isEditableKeyboardEvent(event) &&
      !shouldDeleteSelection(readKeyboardSelection(reactEditor.selection, editor, blockId)),
  }, ({ root, blockId }) => {
    const target = firstKeyboardTarget(readKeyboardSelection(reactEditor.selection, editor, blockId));
    if (!target?.collapsed || target.offset !== 0) return false;
    const rendered = findRenderedBlock(root, target.blockId);
    if (rendered && findParentBlock(rendered)) return false;
    const scope = navigationDomRoot(root, target.blockId);
    if (removeEmptyBlockAfterStructuralPredecessor(reactEditor, scope, target.blockId)) return true;
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

/** Resets the first empty custom block to the default writing type. */
export function registerEmptyBlockReset(reactEditor: ReactEditor): void {
  const { editor, isEmptyBlock, createDefaultBlock } = reactEditor;
  reactEditor.keyboard.register({
    id: KEYBOARD_BINDING_IDS.emptyBlockReset,
    keys: BUILTIN_KEYMAP[KEYBOARD_BINDING_IDS.emptyBlockReset],
    when: ({ raw: event, blockId }) =>
      isEditableKeyboardEvent(event) &&
      !shouldDeleteSelection(readKeyboardSelection(reactEditor.selection, editor, blockId)),
  }, ({ root, blockId }) => {
    const target = firstKeyboardTarget(readKeyboardSelection(reactEditor.selection, editor, blockId));
    if (!target?.collapsed || target.offset !== 0) return false;
    const block = editor.blocks.getBlock(target.blockId);
    // Blocks already considered empty by the host policy skip type reset.
    if (!block || block.content !== "" || isEmptyBlock(block)) return false;
    const scope = navigationDomRoot(root, block.id);
    if (findPreviousEditableBlock(scope, block.id)) return false;
    editor.blocks.setBlockType(block.id, createDefaultBlock().type);
    requestAnimationFrame(() => focusBlock(root, block.id, 0));
    return true;
  });
}
