/**
 * Keyboard registration for movement and growth of whole-block selections.
 *
 * @module
 */
import {
  assertBlockRangeEndpoints,
  hasBlockRanges,
  isStructuralSelection,
  type EditorBlock,
} from "@chulane/rivto";
import { BUILTIN_KEYMAP, KEYBOARD_BINDING_IDS } from "../../../../../managers";
import type { ReactEditor } from "../../../../../types";
import { navigationOutlineBlocks } from "../utils/scope";
import {
  adjacentBlockSelection,
  blockSelection,
  extendBlockSelection,
} from "../utils/block-selection";
import {
  currentNavigationSelection,
  focusBlockSelection,
  setNavigationCaret,
  type VerticalDirection,
} from "../utils/selection";

/**
 * Registers structural selection navigation shortcuts.
 *
 * @param reactEditor - Runtime receiving the keyboard bindings.
 * @returns No value.
 */
export function registerBlockSelectionNavigation(reactEditor: ReactEditor): void {
  const { editor } = reactEditor;
  const isCollapsed = (block: EditorBlock) => (
    reactEditor.blocks.hasListProps("collapse") && block.listProps.collapsed === true
  );
  const move = (root: HTMLElement, direction: VerticalDirection, extend: boolean): boolean => {
    const selection = currentNavigationSelection(reactEditor.selection);
    if (!isStructuralSelection(selection)) return false;
    const item = selection;
    if (!item || !hasBlockRanges(item)) return false;
    const outline = navigationOutlineBlocks(editor, item.focusBlockId);
    const next = extend
      ? extendBlockSelection(outline, item, direction, isCollapsed)
      : adjacentBlockSelection(outline, item, direction, isCollapsed);
    assertBlockRangeEndpoints(next);
    reactEditor.selection.set(next);
    focusBlockSelection(root, next.focusBlockId);
    return true;
  };

  const grow = (root: HTMLElement, direction: VerticalDirection): boolean => {
    const selection = currentNavigationSelection(reactEditor.selection);
    const item = selection;
    if (!item || !hasBlockRanges(item)) return false;
    const outline = navigationOutlineBlocks(editor, item.focusBlockId);
    const next = isStructuralSelection(selection)
      ? extendBlockSelection(outline, item, direction, isCollapsed)
      : blockSelection(outline, item.focusBlockId, item.focusBlockId, isCollapsed);
    if (!next) return false;
    assertBlockRangeEndpoints(next);
    reactEditor.selection.set(next);
    focusBlockSelection(root, next.focusBlockId);
    return true;
  };

  const enterText = (root: HTMLElement): boolean => {
    const blocks = currentNavigationSelection(reactEditor.selection);
    if (!blocks || !isStructuralSelection(blocks) || !hasBlockRanges(blocks)) return false;
    setNavigationCaret(root, reactEditor, { blockId: blocks.focusBlockId, offset: 0 });
    return true;
  };

  const binding = (
    id: string,
    action: (root: HTMLElement) => boolean,
  ) => reactEditor.keyboard.register({
    id,
    keys: BUILTIN_KEYMAP[id],
  }, ({ root }) => action(root));
  binding(KEYBOARD_BINDING_IDS.blockSelectionUp, (root) => move(root, "up", false));
  binding(KEYBOARD_BINDING_IDS.blockSelectionDown, (root) => move(root, "down", false));
  binding(KEYBOARD_BINDING_IDS.blockSelectionExtendUp, (root) => move(root, "up", true));
  binding(KEYBOARD_BINDING_IDS.blockSelectionExtendDown, (root) => move(root, "down", true));
  binding(KEYBOARD_BINDING_IDS.blockSelectionGrowUp, (root) => grow(root, "up"));
  binding(KEYBOARD_BINDING_IDS.blockSelectionGrowDown, (root) => grow(root, "down"));
  binding(KEYBOARD_BINDING_IDS.blockSelectionCaretLeft, enterText);
  binding(KEYBOARD_BINDING_IDS.blockSelectionCaretRight, enterText);
}
