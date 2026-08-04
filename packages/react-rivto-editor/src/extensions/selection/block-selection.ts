import type { BlockSelection } from "@chulane/rivto";
import {
  BLOCK_ID_ATTRIBUTE,
  BLOCK_ID_SELECTOR,
} from "../../constants";
import type { ReactEditor } from "../../types";
import { toggleBlockSelection } from "../page/page-selection-utils";
import { BUILTIN_KEYMAP, KEYBOARD_BINDING_IDS } from "../../managers";
import { findEdgelessRuntime } from "../edgeless/edgeless-runtime";

/**
 * Adds explicit whole-block selection to every editor surface.
 *
 * Ctrl/Cmd+pointer-down runs before the text-selection listener, prevents the
 * browser from placing a caret, and toggles the complete BlockView. Modifier
 * state is also reflected on the root so CSS can replace the text cursor while
 * the next click means "select this block".
 */
export function registerBlockSelection(reactEditor: ReactEditor): () => void {
  const { editor } = reactEditor;
  const setModifierDown = (value: boolean) => {
    const root = reactEditor.events.getRoot();
    if (!root) return;
    if (value) root.dataset.blockSelecting = "true";
    else delete root.dataset.blockSelecting;
  };

  reactEditor.keyboard.register({
    id: KEYBOARD_BINDING_IDS.blockSelectionModifierDown,
    keys: BUILTIN_KEYMAP[KEYBOARD_BINDING_IDS.blockSelectionModifierDown]!,
    target: "window",
    // Every editor in a realm observes the same window keyboard event. Only
    // the surface containing its native target may expose modifier UI.
    when: ({ insideRoot }) => insideRoot,
  }, () => {
    setModifierDown(true);
    return false;
  });
  reactEditor.keyboard.register({
    id: KEYBOARD_BINDING_IDS.blockSelectionModifierUp,
    keys: BUILTIN_KEYMAP[KEYBOARD_BINDING_IDS.blockSelectionModifierUp]!,
    phase: "keyup",
    target: "window",
    when: ({ insideRoot }) => insideRoot,
  }, () => {
    setModifierDown(false);
    return false;
  });
  reactEditor.events.register({
    id: "block-selection.modifier-blur",
    type: "blur",
    target: "window",
  }, () => {
    setModifierDown(false);
    return false;
  });
  reactEditor.events.register({
    id: "block-selection.modifier-focus-owner",
    type: "focusin",
    target: "document",
  }, ({ insideRoot }) => {
    // Keyup is delivered to the newly focused editor when focus changes while
    // Ctrl/Meta is held. Clear the old root at focus time so it cannot retain
    // stale modifier styling indefinitely.
    if (!insideRoot) setModifierDown(false);
    return false;
  });

  reactEditor.events.register({
    id: "block-selection.pointer-toggle",
    type: "pointerdown",
    capture: true,
    scope: "block",
  }, ({ raw: event, root }) => {
    if (event.button !== 0 || (!event.ctrlKey && !event.metaKey)) return false;
    if (
      !(event.target instanceof Element) ||
      event.target.closest(".page-drag-handle, [data-collapse-toggle]")
    ) return false;
    const block = event.target.closest<HTMLElement>(BLOCK_ID_SELECTOR);
    const blockId = block?.getAttribute(BLOCK_ID_ATTRIBUTE);
    if (!block || !blockId || !root.contains(block)) return false;

    const current = editor.selection.get().find((item): item is BlockSelection => item.type === "block");
    const next = toggleBlockSelection(
      editor.blocks.getBlocks(),
      current,
      blockId,
      editor.mode.get() === "edgeless",
    );
    if (editor.mode.get() === "edgeless") findEdgelessRuntime(reactEditor)?.deactivate();
    if (next) editor.selection.set([next]);
    else editor.selection.clear();
    root.ownerDocument.getSelection()?.removeAllRanges();
    root.focus({ preventScroll: true });
    return true;
  });

  return () => {
    const root = reactEditor.events.getRoot();
    if (root) delete root.dataset.blockSelecting;
  };
}
