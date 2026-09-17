/**
 * Keyboard registration for structural movement of blocks and sibling groups.
 *
 * @module
 */
import { isStructuralSelection, type EditorBlock } from "@chulane/rivto";
import { BUILTIN_KEYMAP, KEYBOARD_BINDING_IDS } from "../../../../../managers";
import type { ReactEditor } from "../../../../../types";
import { navigationOutlineBlocks } from "../utils/scope";
import { blockSelection } from "../utils/block-selection";
import { keyboardMovePlacement } from "../utils/move-placement";
import {
  currentNavigationSelection,
  focusBlockSelection,
  type VerticalDirection,
} from "../utils/selection";
import { selectedMoveRoots } from "../utils/move-roots";

/**
 * Registers keyboard movement of the active block or sibling selection.
 *
 * @param reactEditor - Runtime receiving the keyboard bindings.
 * @returns No value.
 */
export function registerKeyboardBlockMove(reactEditor: ReactEditor): void {
  const editor = reactEditor;
  const isCollapsed = (block: EditorBlock) => (
    reactEditor.blocks.hasListProps("collapse") && block.listProps.collapsed === true
  );
  const move = (root: HTMLElement, direction: VerticalDirection): boolean => {
    const selection = currentNavigationSelection(reactEditor.selection);
    const blocks = selection;
    const textLike = blocks && !isStructuralSelection(selection);
    const activeId = selection?.focusBlockId;
    if (!activeId) return false;
    const outline = navigationOutlineBlocks(editor, activeId);
    const roots = selectedMoveRoots(outline, selection, activeId, isCollapsed);
    const placement = keyboardMovePlacement(outline, roots.ids, direction, isCollapsed);
    if (!placement) return false;
    editor.blocks.moveBlocks(roots.ids, placement.targetId, placement.position);
    if (roots.grouped && roots.selection) {
      reactEditor.selection.set(roots.selection);
    } else if (blocks) {
      reactEditor.selection.set(blockSelection(outline, activeId, activeId, isCollapsed));
    }
    requestAnimationFrame(() => {
      if (textLike) reactEditor.selection.restoreDOM(selection);
      else focusBlockSelection(root, activeId);
    });
    return true;
  };

  reactEditor.keyboard.register({
    id: KEYBOARD_BINDING_IDS.blockMoveUp,
    keys: BUILTIN_KEYMAP[KEYBOARD_BINDING_IDS.blockMoveUp],
  }, ({ root }) => move(root, "up"));
  reactEditor.keyboard.register({
    id: KEYBOARD_BINDING_IDS.blockMoveDown,
    keys: BUILTIN_KEYMAP[KEYBOARD_BINDING_IDS.blockMoveDown],
  }, ({ root }) => move(root, "down"));
}
