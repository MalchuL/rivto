/**
 * Caret-placement primitives used by block behaviors after a mutation.
 *
 * Views schedule focus on the next frame so React can remount the BlockView
 * that owns the new caret host. The shared selection scheduler skips stale
 * focus work when another operation publishes a newer selection first.
 *
 * @module
 */
import { createCaretSelection } from "@chulane/rivto";
import type { EditorViewApi } from "../../editor-view/types";
import { focusBlock } from "../../managers/events/block-dom";

/**
 * Publishes a collapsed caret and focuses it after the next paint.
 *
 * @param editorView - Editor view whose portable selection is updated immediately.
 * @param root - Surface or card that contains the target BlockView.
 * @param blockId - Block that should own the caret.
 * @param offset - UTF-16 caret offset inside that block.
 * @returns Nothing; focus is scheduled asynchronously.
 */
export function focusCaret(
  editorView: EditorViewApi,
  root: HTMLElement,
  blockId: string,
  offset: number,
): void {
  editorView.selection.set(createCaretSelection(blockId, offset));
  // Only place the caret and its editing focus; model mutations happen before scheduling.
  editorView.selection.scheduleIfSelectionUnchanged(() => focusBlock(root, blockId, offset));
}

/**
 * Schedules focus for an already-published caret in the next animation frame.
 * A newer model selection cancels the pending focus through the shared selection
 * scheduler, so delayed work cannot replace a more recent selection.
 *
 * @param editorView - Editor view whose current selection guards deferred focus.
 * @param root - Surface or card that contains the target BlockView.
 * @param blockId - Block that should own the caret.
 * @param offset - UTF-16 caret offset inside that block.
 * @returns Nothing; focus is scheduled asynchronously.
 */
export function scheduleBlockFocus(editorView: EditorViewApi, root: HTMLElement, blockId: string, offset: number): void {
  // Only place the caret and its editing focus; model mutations happen before scheduling.
  editorView.selection.scheduleIfSelectionUnchanged(() => focusBlock(root, blockId, offset));
}
