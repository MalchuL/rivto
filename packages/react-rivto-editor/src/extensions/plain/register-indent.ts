/**
 * Plain-mode Tab handling.
 *
 * The built-in indent binding nests under the previous stored sibling. That
 * sibling can be a block the plain projection does not render. This module
 * replaces that registration in place so the stable `block.indent` id — and
 * any keymap override attached to it — still applies, then routes plain mode
 * through {@link plainIndentBlocks}.
 *
 * @module
 */
import { getSelectedBlockIds, isStructuralSelection } from "@chulane/rivto";
import {
  firstKeyboardTarget,
  isEditableKeyboardEvent,
  KEYBOARD_BINDING_IDS,
} from "../../managers";
import type { ReactEditor } from "../../types";
import { applyIndentShortcut } from "../built-ins/page/indent/utils";
import { plainIndentBlocks } from "./projection";

/**
 * Installs indent that follows the plain outline while plain mode is active.
 *
 * Must run after `indentExtension` (included in `standardPreset`). Installing
 * earlier would leave the built-in handler registered second and it would
 * reject the duplicate id.
 *
 * @param reactEditor - Runtime whose keyboard registry is updated.
 * @param blockTypes - Types the plain editor is allowed to show.
 * @returns Nothing; the replacement binding is owned by the extension.
 */
export function registerPlainIndent(
  reactEditor: ReactEditor,
  blockTypes: ReadonlySet<string>,
): void {
  const existing = reactEditor.keyboard.list().find((binding) => binding.id === KEYBOARD_BINDING_IDS.blockIndent);
  const keys = existing?.defaultKeys.length ? existing.defaultKeys : ["Tab"];
  // Replacing the built-in registration is required: keyboard ids are unique,
  // and a second Tab binding cannot keep the host's keymap override on
  // `block.indent`. Page and edgeless still call the original shortcut.
  reactEditor.keyboard.delete(KEYBOARD_BINDING_IDS.blockIndent);
  reactEditor.keyboard.register({
    id: KEYBOARD_BINDING_IDS.blockIndent,
    keys,
  }, ({ raw: event, root }) => {
    if (reactEditor.mode.get() !== "plain") {
      return applyIndentShortcut(reactEditor.selection, root, event, false, reactEditor);
    }
    const editable = isEditableKeyboardEvent(event);
    const nativeSelection = editable ? reactEditor.selection.readDOM() : undefined;
    if (nativeSelection) reactEditor.selection.set(nativeSelection);
    const selection = nativeSelection ?? reactEditor.selection.get();
    const target = firstKeyboardTarget(selection);
    if (!target) return false;
    const blockSelectionAtRoot = event.target === root && isStructuralSelection(target.item);
    if (!editable && !blockSelectionAtRoot) return false;
    plainIndentBlocks(reactEditor.blocks, getSelectedBlockIds(target.item), blockTypes);
    const captured = selection;
    requestAnimationFrame(() => {
      if (!captured) return;
      reactEditor.selection.set(captured);
      reactEditor.selection.restoreDOM(captured);
    });
    return true;
  });
}
