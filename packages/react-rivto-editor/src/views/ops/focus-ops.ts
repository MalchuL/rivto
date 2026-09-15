/**
 * Caret-placement primitives used by block views after a mutation.
 *
 * Views schedule focus on the next frame so React can remount the BlockView
 * that owns the new caret host.
 *
 * @module
 */
import { createCaretSelection } from "@chulane/rivto";
import { focusBlock } from "../../managers";
import type { ReactEditor } from "../../types";

/**
 * Publishes a collapsed caret and focuses it after the next paint.
 *
 * @param reactEditor - Runtime whose portable selection is updated immediately.
 * @param root - Surface or card that contains the target BlockView.
 * @param blockId - Block that should own the caret.
 * @param offset - UTF-16 caret offset inside that block.
 * @returns Nothing; focus is scheduled asynchronously.
 */
export function focusCaret(
  reactEditor: ReactEditor,
  root: HTMLElement,
  blockId: string,
  offset: number,
): void {
  reactEditor.selection.set(createCaretSelection(blockId, offset));
  requestAnimationFrame(() => focusBlock(root, blockId, offset));
}

/**
 * Focuses an already-published caret after the next paint.
 *
 * @param root - Surface or card that contains the target BlockView.
 * @param blockId - Block that should own the caret.
 * @param offset - UTF-16 caret offset inside that block.
 * @returns Nothing; focus is scheduled asynchronously.
 */
export function focusBlockLater(root: HTMLElement, blockId: string, offset: number): void {
  requestAnimationFrame(() => focusBlock(root, blockId, offset));
}
