import type { BlockSelection } from "@chulane/rivto";
import {
  BLOCK_ID_ATTRIBUTE,
  BLOCK_ID_SELECTOR,
} from "../constants";
import {
  useEditor,
  useDOMEvent,
  useEditorRoot,
  useKeyboardEvent,
} from "../hooks";
import { useEffect, useState } from "react";
import { toggleBlockSelection } from "./utils/page-selection";
import { BUILTIN_KEYMAP, KEYBOARD_BINDING_IDS } from "../events/keymap";

/**
 * Adds explicit whole-block selection to the demo page surface.
 *
 * Ctrl/Cmd+pointer-down runs before the text-selection listener, prevents the
 * browser from placing a caret, and toggles the complete BlockView. Modifier
 * state is also reflected on the root so CSS can replace the text cursor while
 * the next click means "select this block".
 */
export function PageBlockSelectionPlugin() {
  const editor = useEditor();
  const { element: root } = useEditorRoot();
  const [modifierDown, setModifierDown] = useState(false);

  useEffect(() => {
    if (!root) return;
    if (modifierDown) root.dataset.blockSelecting = "true";
    else delete root.dataset.blockSelecting;
    return () => { delete root.dataset.blockSelecting; };
  }, [modifierDown, root]);

  useKeyboardEvent({
    id: KEYBOARD_BINDING_IDS.blockSelectionModifierDown,
    keys: BUILTIN_KEYMAP[KEYBOARD_BINDING_IDS.blockSelectionModifierDown]!,
    target: "window",
  }, () => {
    setModifierDown(true);
    return false;
  });
  useKeyboardEvent({
    id: KEYBOARD_BINDING_IDS.blockSelectionModifierUp,
    keys: BUILTIN_KEYMAP[KEYBOARD_BINDING_IDS.blockSelectionModifierUp]!,
    phase: "keyup",
    target: "window",
  }, () => {
    setModifierDown(false);
    return false;
  });
  useDOMEvent("blur", () => {
    setModifierDown(false);
    return false;
  }, { target: "window" });

  useDOMEvent("pointerdown", ({ event }) => {
    if (event.button !== 0 || (!event.ctrlKey && !event.metaKey)) return false;
    if (
      !(event.target instanceof Element) ||
      event.target.closest(".page-drag-handle, [data-collapse-toggle]")
    ) return false;
    const block = event.target.closest<HTMLElement>(BLOCK_ID_SELECTOR);
    const blockId = block?.getAttribute(BLOCK_ID_ATTRIBUTE);
    if (!root || !block || !blockId || !root.contains(block)) return false;

    const current = editor.selection.get().find((item): item is BlockSelection => item.type === "block");
    const next = toggleBlockSelection(editor.getBlocks(), current, blockId);
    editor.execute(next ? "selection.set" : "selection.clear", next ? { selection: [next] } : undefined);
    root.ownerDocument.getSelection()?.removeAllRanges();
    root.focus({ preventScroll: true });
    return true;
  }, { capture: true });

  return null;
}
