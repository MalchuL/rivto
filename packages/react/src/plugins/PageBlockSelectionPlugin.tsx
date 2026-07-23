import {
  BLOCK_ID_ATTRIBUTE,
  BLOCK_ID_SELECTOR,
  useEditor,
  useEditorEvent,
  useEditorRoot,
  type BlockSelection,
} from "../internal";
import { useEffect, useState } from "react";
import { toggleBlockSelection } from "./utils/page-selection";

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

  useEffect(() => {
    if (!root) return;
    const window = root.ownerDocument.defaultView;
    if (!window) return;
    const down = (event: KeyboardEvent) => {
      if (event.key === "Control" || event.key === "Meta") setModifierDown(true);
    };
    const up = (event: KeyboardEvent) => {
      if (event.key === "Control" || event.key === "Meta") setModifierDown(false);
    };
    const clear = () => setModifierDown(false);
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    window.addEventListener("blur", clear);
    return () => {
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
      window.removeEventListener("blur", clear);
    };
  }, [root]);

  useEditorEvent("pointerdown", (event) => {
    if (event.defaultPrevented || event.button !== 0 || (!event.ctrlKey && !event.metaKey)) return;
    if (
      !(event.target instanceof Element) ||
      event.target.closest(".page-drag-handle, [data-collapse-toggle]")
    ) return;
    const block = event.target.closest<HTMLElement>(BLOCK_ID_SELECTOR);
    const blockId = block?.getAttribute(BLOCK_ID_ATTRIBUTE);
    if (!root || !block || !blockId || !root.contains(block)) return;

    event.preventDefault();
    const current = editor.selection.get().find((item): item is BlockSelection => item.type === "block");
    const next = toggleBlockSelection(editor.getBlocks(), current, blockId);
    editor.execute(next ? "selection.set" : "selection.clear", next ? { selection: [next] } : undefined);
    root.ownerDocument.getSelection()?.removeAllRanges();
    root.focus({ preventScroll: true });
  }, true);

  return null;
}
