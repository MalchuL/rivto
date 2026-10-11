import type { EditorRuntime } from "../../../../../editor/editor-runtime";
/**
 * Keyboard registration for structural movement of blocks and sibling groups.
 *
 * @module
 */
import { isStructuralSelection, type EditorBlock } from "@chulane/rivto";
import type { EditorViewApi } from "../../../../../editor-view/types";
import { BUILTIN_KEYMAP, KEYBOARD_BINDING_IDS } from "../../../../../managers";
import { blockSelection } from "../utils/block-selection";
import { keyboardMovePlacement } from "../utils/move-placement";
import { selectedMoveRoots } from "../utils/move-roots";
import { navigationOutlineBlocks } from "../utils/scope";
import {
  currentNavigationSelection,
  focusBlockSelection,
  type VerticalDirection,
} from "../utils/selection";

/**
 * Registers keyboard movement of the active block or sibling selection.
 *
 * @param editorRuntime - Runtime receiving the keyboard bindings.
 * @returns No value.
 */
export function registerKeyboardBlockMove(editorRuntime: EditorRuntime): void {
  const isCollapsed = (block: EditorBlock) => (
    !editorRuntime.blockListProps.childrenVisible(block)
  );
  const move = (editorView: EditorViewApi, root: HTMLElement, direction: VerticalDirection): boolean => {
    const selection = currentNavigationSelection(editorView.selection);
    const blocks = selection;
    const textLike = blocks && !isStructuralSelection(selection);
    const activeId = selection?.focusBlockId;
    if (!activeId) return false;
    const outline = navigationOutlineBlocks(editorView, activeId);
    const roots = selectedMoveRoots(outline, selection, activeId, isCollapsed);
    const placement = keyboardMovePlacement(outline, roots.ids, direction, isCollapsed);
    if (!placement) return false;
    editorView.runtime.blocks.moveBlocks(roots.ids, placement.targetId, placement.position);
    if (roots.grouped && roots.selection) {
      editorView.selection.set(roots.selection);
    } else if (blocks) {
      editorView.selection.set(blockSelection(outline, activeId, activeId, isCollapsed));
    }
    // Only restore selection and its focus after the move; block mutations remain synchronous.
    editorView.selection.scheduleIfSelectionUnchanged(() => {
      if (textLike) editorView.selection.restoreDOM(selection);
      else focusBlockSelection(root, activeId);
    });
    return true;
  };

  editorRuntime.keyboard.register({
    id: KEYBOARD_BINDING_IDS.blockMoveUp,
    keys: BUILTIN_KEYMAP[KEYBOARD_BINDING_IDS.blockMoveUp],
  }, ({ editorView, root }) => move(editorView, root, "up"));
  editorRuntime.keyboard.register({
    id: KEYBOARD_BINDING_IDS.blockMoveDown,
    keys: BUILTIN_KEYMAP[KEYBOARD_BINDING_IDS.blockMoveDown],
  }, ({ editorView, root }) => move(editorView, root, "down"));
}
