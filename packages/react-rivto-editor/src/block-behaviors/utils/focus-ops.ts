/**
 * Caret-placement primitives used by block behaviors after a mutation.
 *
 * Views schedule focus on the next frame so React can remount the block shell
 * that owns the new caret host. The shared selection scheduler skips stale
 * focus work when another operation publishes a newer selection first.
 *
 * @module
 */
import { createCaretSelection } from "@chulane/rivto";
import type { InputRoot } from "@chulane/rivto-root";
import type { PanelInputRegistration } from "../../panels/types";
import type { CaretFocusPanel, CaretSelectionPanel } from "../types";

/**
 * Publishes a collapsed caret and focuses it after the next paint.
 *
 * A supplied attachment must belong to this panel and remain current before selection changes. Without
 * one, the model selection is published but browser focus is not scheduled.
 *
 * @param reactPanel - Editor view whose portable selection is updated immediately.
 * @param blockId - Block that should own the caret.
 * @param offset - UTF-16 caret offset inside that block.
 * @param inputRoot - Originating keyboard or UI attachment, when available.
 * @param inputRegistration - Keyboard routing lifetime, when invoked from input.
 * @returns Selection is published and focus scheduled when an attachment is
 * available, or neither occurs for a stale attachment.
 * @throws Propagates attachment checks, selection updates and focus scheduling failures.
 */
export function focusCaret(
  reactPanel: CaretSelectionPanel,
  blockId: string,
  offset: number,
  inputRoot?: Pick<InputRoot, "isAttached">,
  inputRegistration?: PanelInputRegistration,
): void {
  if (
    (inputRegistration && (!inputRoot || !inputRegistration.isCurrent(inputRoot))) ||
    (inputRoot && (reactPanel.inputRoot !== inputRoot || !inputRoot.isAttached())) ||
    (inputRegistration && !inputRegistration.isCurrent(inputRoot)) ||
    (inputRoot && reactPanel.inputRoot !== inputRoot)
  ) {
    return;
  }
  reactPanel.selection.set(createCaretSelection(blockId, offset));
  // Only place the caret and its editing focus; model mutations happen before scheduling.
  scheduleBlockFocus(reactPanel, blockId, offset, inputRoot, inputRegistration);
}

/**
 * Schedules focus for an already-published caret in the next animation frame.
 * A newer model selection cancels the pending focus through the shared selection
 * scheduler, so delayed work cannot replace a more recent selection.
 * The panel resolves the block in its attached occurrence and may mount a missing
 * block; a detached occurrence or unavailable content cannot receive focus.
 * The captured input Root must belong to this panel and remain attached. When a
 * keyboard registration is supplied, it must also remain current. Without an
 * input Root no focus work is scheduled.
 *
 * @param reactPanel - Editor view whose current selection guards deferred focus.
 * @param blockId - Block that should own the caret.
 * @param offset - UTF-16 caret offset inside that block.
 * @param inputRoot - Originating mounted or keyboard registration capability, when available.
 * @param inputRegistration - Keyboard routing lifetime, when invoked from input.
 * @returns Focus is scheduled when the originating occurrence remains current.
 * @throws Propagates attachment checks and focus scheduling failures.
 */
export function scheduleBlockFocus(
  reactPanel: CaretFocusPanel,
  blockId: string,
  offset: number,
  inputRoot?: Pick<InputRoot, "isAttached">,
  inputRegistration?: PanelInputRegistration,
): void {
  // Only place the caret and its editing focus; model mutations happen before scheduling.
  if (
    !inputRoot ||
    reactPanel.inputRoot !== inputRoot ||
    !inputRoot.isAttached() ||
    (inputRegistration && !inputRegistration.isCurrent(inputRoot)) ||
    reactPanel.inputRoot !== inputRoot
  ) {
    return;
  }
  reactPanel.selection.scheduleIfSelectionUnchanged(() => {
    if (
      reactPanel.inputRoot === inputRoot &&
      inputRoot.isAttached() &&
      (!inputRegistration || inputRegistration.isCurrent(inputRoot)) &&
      reactPanel.inputRoot === inputRoot
    ) {
      reactPanel.selection.focusBlock(blockId, offset);
    }
  });
}
