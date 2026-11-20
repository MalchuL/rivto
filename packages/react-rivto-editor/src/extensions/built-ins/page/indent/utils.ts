/**
 * Tab / Shift+Tab dispatch for outline indent and outdent.
 *
 * Eligibility stays here so a focused toolbar cannot indent. The resolved
 * behavior chain performs the semantic move; parent outline handlers and move
 * permissions turn an illegal indent or floor lift into a no-op.
 *
 * @module
 */
import { getSelectedBlockIds, isStructuralSelection } from "@chulane/rivto";
import { createBlockOutlineContext } from "../../../../block-behaviors/utils/context";
import type { IndentPanel } from "./types";
import { firstKeyboardTarget, type KeyboardSelectionTarget } from "../../../../managers";
import type { KeyboardEditorEvent } from "../../../../managers/keyboard/keyboard-editor-event";
import type { PanelSelectionApi } from "../../../../managers/selection/api";

/**
 * Resolves the identifiers moved by one indent shortcut.
 *
 * @param target - Keyboard target that qualified the shortcut.
 * @returns Selected structural IDs or the active text block ID.
 */
function indentTargetIds(target: KeyboardSelectionTarget): string[] {
  return getSelectedBlockIds(target.item);
}

/**
 * Applies one semantic indent or outdent binding through the target block view.
 *
 * Whole-block selections indent or outdent every selected ID as one group. A
 * text caret indents only the focused block. The normalized target queries
 * confirm that the shortcut originated in editable page content or from a
 * whole-block selection focused on the page root.
 *
 * @param selectionManager - React selection bridge used to restore the caret.
 * @param event - Target queries for the keyboard event that matched the binding.
 * @param outdent - Whether this invocation lifts rather than nests.
 * @param reactPanel - Editor view used to resolve the target block view.
 * @returns `true` when the shortcut was claimed.
 */
export function applyIndentShortcut(
  selectionManager: Pick<PanelSelectionApi, "readDOM" | "set" | "get" | "runWithViewportPreserved">,
  event: Pick<
    KeyboardEditorEvent,
    "isBlockContentTarget" | "isRootTarget" | "inputRoot" | "inputRegistration"
  >,
  outdent: boolean,
  reactPanel: IndentPanel,
): boolean {
  const editable = event.isBlockContentTarget();
  const nativeSelection = editable ? selectionManager.readDOM() : undefined;
  if (nativeSelection) {
    selectionManager.set(nativeSelection);
  }
  const selection = nativeSelection ?? selectionManager.get();
  const target = firstKeyboardTarget(selection);
  if (!target) {
    return false;
  }
  const blockSelectionAtRoot = event.isRootTarget() && isStructuralSelection(target.item);
  if (!editable && !blockSelectionAtRoot) {
    return false;
  }

  const context = createBlockOutlineContext(reactPanel, target.blockId, selection);
  if (!context) {
    return false;
  }
  const targetIds = indentTargetIds(target);
  return selectionManager.runWithViewportPreserved(
    targetIds,
    target.item,
    event.inputRoot,
    event.inputRegistration,
    () =>
      reactPanel.editor.blockBehaviors.dispatch(
        outdent ? "onOutdent" : "onIndent",
        context,
        targetIds,
      ),
  );
}
