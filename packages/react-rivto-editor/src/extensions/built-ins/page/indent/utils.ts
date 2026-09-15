/**
 * Tab / Shift+Tab dispatch for outline indent and outdent.
 *
 * Eligibility stays here so a focused toolbar cannot indent. The resolved
 * block view performs the semantic move; React definition metadata turns an
 * illegal indent or floor lift into a no-op.
 *
 * @module
 */
import {
  getSelectedBlockIds,
  isStructuralSelection,
  type RivtoEditorApi as Editor,
} from "@chulane/rivto";
import type { SelectionCapability } from "../../../../capabilities";
import {
  firstKeyboardTarget,
  isEditableKeyboardEvent,
  type KeyboardSelectionTarget,
} from "../../../../managers";
import type { ReactEditor } from "../../../../types";
import { createBlockViewContext, dispatchViewAction } from "../../../../views";

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
 * text caret indents only the focused block. The DOM event is used only to
 * confirm that the shortcut originated in editable page content or from a
 * whole-block selection focused on the page root.
 *
 * @param editor - Core editor whose selection is republished after reparenting.
 * @param selectionManager - React selection bridge used to restore the caret.
 * @param root - Active page surface or edgeless card.
 * @param event - Native keyboard event that matched the binding.
 * @param outdent - Whether this invocation lifts rather than nests.
 * @param reactEditor - Runtime used to resolve the target block view.
 * @returns `true` when the shortcut was claimed.
 */
export function applyIndentShortcut(
  editor: Editor,
  selectionManager: SelectionCapability,
  root: HTMLElement,
  event: KeyboardEvent,
  outdent: boolean,
  reactEditor: ReactEditor,
): boolean {
  const editable = isEditableKeyboardEvent(event);
  const nativeSelection = editable ? selectionManager.readDOM() : undefined;
  if (nativeSelection) selectionManager.set(nativeSelection);
  const selection = nativeSelection ?? selectionManager.get();
  const target = firstKeyboardTarget(selection);
  if (!target) return false;
  const blockSelectionAtRoot = event.target === root && isStructuralSelection(target.item);
  if (!editable && !blockSelectionAtRoot) return false;

  const context = createBlockViewContext(reactEditor, target.blockId, root, selection);
  if (!context) return false;
  const claimed = dispatchViewAction(
    reactEditor.views.resolve(context.block.id),
    reactEditor.views.fallback,
    outdent ? "onOutdent" : "onIndent",
    context,
    indentTargetIds(target),
  );

  // React may reparent every selected BlockView and cause the browser to emit
  // a transient empty selectionchange. Re-publish the selection captured
  // before the command, then resolve its text endpoints in the committed DOM.
  requestAnimationFrame(() => {
    selectionManager.set(selection!);
    selectionManager.restoreDOM(selection);
  });
  return claimed;
}
