import { isStructuralSelection } from "@chulane/rivto";
import {
  BLOCK_ID_ATTRIBUTE,
  BLOCK_ID_SELECTOR,
} from "../../../constants";
import type { EditorRuntime } from "../../../editor/editor-runtime";
import { BUILTIN_KEYMAP, KEYBOARD_BINDING_IDS } from "../../../managers";
import { toggleBlockSelection } from "../page/navigation";
import { findEdgelessRuntime } from "./edgeless-runtime";

/**
 * Adds explicit whole-block selection to every editor surface.
 *
 * Ctrl/Cmd+pointer-down runs before the text-selection listener, prevents the
 * browser from placing a caret, and toggles the complete BlockView. Modifier
 * state is also reflected on the root so CSS can replace the text cursor while
 * the next click means "select this block".
 */
export function registerBlockSelection(editorRuntime: EditorRuntime): () => void {
  const markedRoots = new Set<HTMLElement>();
  const setModifierDown = (root: HTMLElement, value: boolean) => {
    if (!root) return;
    if (value) { root.dataset.blockSelecting = "true"; markedRoots.add(root); }
    else { delete root.dataset.blockSelecting; markedRoots.delete(root); }
  };

  editorRuntime.keyboard.register({
    id: KEYBOARD_BINDING_IDS.blockSelectionModifierDown,
    keys: BUILTIN_KEYMAP[KEYBOARD_BINDING_IDS.blockSelectionModifierDown]!,
    target: "window",
    // Every editor in a realm observes the same window keyboard event. Only
    // the surface containing its native target may expose modifier UI.
    when: ({ insideRoot }) => insideRoot,
  }, ({ root }) => {
    setModifierDown(root, true);
    return false;
  });
  editorRuntime.keyboard.register({
    id: KEYBOARD_BINDING_IDS.blockSelectionModifierUp,
    keys: BUILTIN_KEYMAP[KEYBOARD_BINDING_IDS.blockSelectionModifierUp]!,
    phase: "keyup",
    target: "window",
    when: ({ insideRoot }) => insideRoot,
  }, ({ root }) => {
    setModifierDown(root, false);
    return false;
  });
  editorRuntime.events.register({
    id: "block-selection.modifier-blur",
    type: "blur",
    target: "window",
  }, ({ root }) => {
    setModifierDown(root, false);
    return false;
  });
  editorRuntime.events.register({
    id: "block-selection.modifier-focus-owner",
    type: "focusin",
    target: "document",
  }, ({ root, insideRoot }) => {
    // Keyup is delivered to the newly focused editor when focus changes while
    // Ctrl/Meta is held. Clear the old root at focus time so it cannot retain
    // stale modifier styling indefinitely.
    if (!insideRoot) setModifierDown(root, false);
    return false;
  });

  editorRuntime.events.register({
    id: "block-selection.pointer-toggle",
    type: "pointerdown",
    capture: true,
    scope: "block",
  }, ({ editorView, raw: event, root, mode }) => {
    if (event.button !== 0 || (!event.ctrlKey && !event.metaKey)) return false;
    if (
      !(event.target instanceof Element) ||
      event.target.closest(".page-drag-handle, [data-collapse-toggle]")
    ) return false;
    const block = event.target.closest<HTMLElement>(BLOCK_ID_SELECTOR);
    const blockId = block?.getAttribute(BLOCK_ID_ATTRIBUTE);
    if (!block || !blockId || !root.contains(block)) return false;

    const selection = editorView.selection.get();
    // A caret starts a new block selection; carrying its partial range forward
    // creates a mixed selection that the next native selectionchange clears.
    const current = isStructuralSelection(selection) ? selection : undefined;
    const next = toggleBlockSelection(
      editorView.runtime.blocks.getBlocks(),
      current,
      blockId,
      mode === "edgeless",
      (candidate) => !editorView.runtime.blockListProps.childrenVisible(candidate),
    );
    const canvas = mode === "edgeless" ? findEdgelessRuntime(editorView) : undefined;
    if (next && canvas) canvas.setBlocks(next);
    else if (next) editorView.selection.set(next);
    else editorView.selection.clear();
    root.ownerDocument.getSelection()?.removeAllRanges();
    root.focus({ preventScroll: true });
    return true;
  });

  return () => {
    markedRoots.forEach((root) => { delete root.dataset.blockSelecting; });
    markedRoots.clear();
  };
}
