/**
 * Enter dispatch for outline block splitting and creation.
 *
 * The declarative `block.create` binding decides which key invokes this action.
 * The resolved block view owns the semantic (split, insert-first-child, lift
 * an empty nested block). This module only reads the caret, deletes an
 * expanded selection, and claims the key.
 *
 * @module
 */
import { firstKeyboardTarget, isEditableKeyboardEvent, shouldDeleteSelection } from "../../../../managers";
import { BUILTIN_KEYMAP, KEYBOARD_BINDING_IDS } from "../../../../managers";
import type { ReactEditor } from "../../../../types";
import { createBlockViewContext, dispatchViewAction } from "../../../../views";

/**
 * Installs outline block splitting for Page and Edgeless surfaces.
 *
 * The first covered block supplies the only insertion target, so a multi-item
 * selection never creates several blocks. Expanded text is deleted first.
 * Shift+Enter remains native plaintext input.
 *
 * @param reactEditor - Runtime whose keyboard registry and views are used.
 * @returns Nothing; the binding is owned by the extension lifecycle.
 */
export function registerBlockCreation(reactEditor: ReactEditor): void {
  reactEditor.keyboard.register({
    id: KEYBOARD_BINDING_IDS.blockCreate,
    keys: BUILTIN_KEYMAP[KEYBOARD_BINDING_IDS.blockCreate]!,
  }, ({ raw: event, root }) => {
    if (!isEditableKeyboardEvent(event)) return false;
    // Read the key event's native caret synchronously. A newly focused editor
    // can receive Enter before the browser's deferred selectionchange event.
    const nativeSelection = reactEditor.selection.readDOM();
    if (nativeSelection) reactEditor.selection.set(nativeSelection);
    const selection = nativeSelection ?? reactEditor.selection.get();
    const initialTarget = firstKeyboardTarget(selection);
    if (!initialTarget) return false;

    let claimed = false;
    // Selection deletion, text splitting, insertion, and nesting share one CRDT
    // transaction, so Enter is one collaborative update and one undo step.
    reactEditor.history.batchUpdates(() => {
      let target = initialTarget;
      if (shouldDeleteSelection(selection)) {
        reactEditor.selection.delete();
        const collapsed = firstKeyboardTarget(reactEditor.selection.get());
        if (!collapsed?.collapsed) return;
        target = collapsed;
      }
      const context = createBlockViewContext(reactEditor, target.blockId, root, reactEditor.selection.get());
      if (!context) return;
      claimed = dispatchViewAction(
        reactEditor.views.resolve(context.block.id),
        reactEditor.views.fallback,
        "onSplit",
        context,
        target,
      );
    });
    return claimed;
  });
}
