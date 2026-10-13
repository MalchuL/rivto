import type { ReactEditorApi } from "../../../../../editor/types";
/**
 * Keyboard registration for structural movement of blocks and sibling groups.
 *
 * @module
 */
import { isStructuralSelection, type EditorBlock } from "@chulane/rivto";
import type { ReactPanelApi } from "../../../../../panels/types";
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
 * @param reactEditor - Runtime receiving the keyboard bindings.
 * @returns No value.
 */
export function registerKeyboardBlockMove(reactEditor: ReactEditorApi): void {
  const isCollapsed = (block: EditorBlock) => (
    !reactEditor.blockListProps.childrenVisible(block)
  );
  const move = (reactPanel: ReactPanelApi, root: HTMLElement, direction: VerticalDirection): boolean => {
    const selection = currentNavigationSelection(reactPanel.selection);
    const blocks = selection;
    const textLike = blocks && !isStructuralSelection(selection);
    const activeId = selection?.focusBlockId;
    if (!activeId) return false;
    const outline = navigationOutlineBlocks(reactPanel, activeId);
    const roots = selectedMoveRoots(outline, selection, activeId, isCollapsed);
    const placement = keyboardMovePlacement(outline, roots.ids, direction, isCollapsed);
    if (!placement) return false;
    reactPanel.blocks.moveBlocks(roots.ids, placement.targetId, placement.position);
    if (roots.grouped && roots.selection) {
      reactPanel.selection.set(roots.selection);
    } else if (blocks) {
      reactPanel.selection.set(blockSelection(outline, activeId, activeId, isCollapsed));
    }
    // Only restore selection and its focus after the move; block mutations remain synchronous.
    reactPanel.selection.scheduleIfSelectionUnchanged(() => {
      if (textLike) reactPanel.selection.restoreDOM(selection);
      else focusBlockSelection(root, activeId);
    });
    return true;
  };

  reactEditor.keyboard.register({
    id: KEYBOARD_BINDING_IDS.blockMoveUp,
    keys: BUILTIN_KEYMAP[KEYBOARD_BINDING_IDS.blockMoveUp],
  }, ({ reactPanel, root }) => move(reactPanel, root, "up"));
  reactEditor.keyboard.register({
    id: KEYBOARD_BINDING_IDS.blockMoveDown,
    keys: BUILTIN_KEYMAP[KEYBOARD_BINDING_IDS.blockMoveDown],
  }, ({ reactPanel, root }) => move(reactPanel, root, "down"));
}
