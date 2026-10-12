import type { ReactEditorApi } from "../../../../../editor/types";
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
import type { PanelAPI } from "../../../../../panels/types";
import { BUILTIN_KEYMAP, KEYBOARD_BINDING_IDS } from "../../../../../managers";
import {
  adjacentBlockSelection,
  blockSelection,
  extendBlockSelection,
} from "../utils/block-selection";
import { navigationOutlineBlocks } from "../utils/scope";
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
export function registerBlockSelectionNavigation(reactEditor: ReactEditorApi): void {
  const isCollapsed = (block: EditorBlock) => (
    !reactEditor.blockListProps.childrenVisible(block)
  );
  const move = (panel: PanelAPI, root: HTMLElement, direction: VerticalDirection, extend: boolean): boolean => {
    const selection = currentNavigationSelection(panel.selection);
    if (!isStructuralSelection(selection)) return false;
    const item = selection;
    if (!item || !hasBlockRanges(item)) return false;
    const outline = navigationOutlineBlocks(panel, item.focusBlockId);
    const next = extend
      ? extendBlockSelection(outline, item, direction, isCollapsed)
      : adjacentBlockSelection(outline, item, direction, isCollapsed);
    assertBlockRangeEndpoints(next);
    panel.selection.set(next);
    focusBlockSelection(root, next.focusBlockId);
    return true;
  };

  const grow = (panel: PanelAPI, root: HTMLElement, direction: VerticalDirection): boolean => {
    const selection = currentNavigationSelection(panel.selection);
    const item = selection;
    if (!item || !hasBlockRanges(item)) return false;
    const outline = navigationOutlineBlocks(panel, item.focusBlockId);
    const next = isStructuralSelection(selection)
      ? extendBlockSelection(outline, item, direction, isCollapsed)
      : blockSelection(outline, item.focusBlockId, item.focusBlockId, isCollapsed);
    if (!next) return false;
    assertBlockRangeEndpoints(next);
    panel.selection.set(next);
    focusBlockSelection(root, next.focusBlockId);
    return true;
  };

  const enterText = (panel: PanelAPI, root: HTMLElement): boolean => {
    const blocks = currentNavigationSelection(panel.selection);
    if (!blocks || !isStructuralSelection(blocks) || !hasBlockRanges(blocks)) return false;
    setNavigationCaret(root, panel, { blockId: blocks.focusBlockId, offset: 0 });
    return true;
  };

  const binding = (
    id: string,
    action: (panel: PanelAPI, root: HTMLElement) => boolean,
  ) => reactEditor.keyboard.register({
    id,
    keys: BUILTIN_KEYMAP[id],
  }, ({ panel, root }) => action(panel, root));
  binding(KEYBOARD_BINDING_IDS.blockSelectionUp, (editor, root) => move(editor, root, "up", false));
  binding(KEYBOARD_BINDING_IDS.blockSelectionDown, (editor, root) => move(editor, root, "down", false));
  binding(KEYBOARD_BINDING_IDS.blockSelectionExtendUp, (editor, root) => move(editor, root, "up", true));
  binding(KEYBOARD_BINDING_IDS.blockSelectionExtendDown, (editor, root) => move(editor, root, "down", true));
  binding(KEYBOARD_BINDING_IDS.blockSelectionGrowUp, (editor, root) => grow(editor, root, "up"));
  binding(KEYBOARD_BINDING_IDS.blockSelectionGrowDown, (editor, root) => grow(editor, root, "down"));
  binding(KEYBOARD_BINDING_IDS.blockSelectionCaretLeft, enterText);
  binding(KEYBOARD_BINDING_IDS.blockSelectionCaretRight, enterText);
}
