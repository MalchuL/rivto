import type { ReactEditorExtensionApi } from "../../../../../editor/types";
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
import type { NavigationPanel } from "../utils/types";
import { BUILTIN_KEYMAP, KEYBOARD_BINDING_IDS } from "../../../../../managers";
import {
  adjacentBlockSelection,
  blockSelection,
  extendBlockSelection,
} from "../utils/block-selection";
import { navigationOutlineBlocks } from "../utils/scope";
import {
  currentNavigationSelection,
  setNavigationCaret,
  type VerticalDirection,
} from "../utils/selection";

/**
 * Registers structural selection navigation shortcuts.
 *
 * @param reactEditor - Runtime receiving the keyboard bindings.
 * @returns No value.
 */
export function registerBlockSelectionNavigation(reactEditor: ReactEditorExtensionApi): void {
  // Arrow navigation and range extension must skip descendants hidden by the shared visibility policy.
  const isCollapsed = (block: EditorBlock) => !reactEditor.blockBehaviors.childrenVisible(block);
  const move = (
    reactPanel: NavigationPanel,
    direction: VerticalDirection,
    extend: boolean,
  ): boolean => {
    const selection = currentNavigationSelection(reactPanel.selection);
    if (!isStructuralSelection(selection)) {
      return false;
    }
    const item = selection;
    if (!item || !hasBlockRanges(item)) {
      return false;
    }
    const outline = navigationOutlineBlocks(reactPanel, item.focusBlockId);
    const next = extend
      ? extendBlockSelection(outline, item, direction, isCollapsed)
      : adjacentBlockSelection(outline, item, direction, isCollapsed);
    assertBlockRangeEndpoints(next);
    reactPanel.selection.set(next);
    reactPanel.selection.focusBlockSelection(next.focusBlockId);
    return true;
  };

  const grow = (reactPanel: NavigationPanel, direction: VerticalDirection): boolean => {
    const selection = currentNavigationSelection(reactPanel.selection);
    const item = selection;
    if (!item || !hasBlockRanges(item)) {
      return false;
    }
    const outline = navigationOutlineBlocks(reactPanel, item.focusBlockId);
    const next = isStructuralSelection(selection)
      ? extendBlockSelection(outline, item, direction, isCollapsed)
      : blockSelection(outline, item.focusBlockId, item.focusBlockId, isCollapsed);
    if (!next) {
      return false;
    }
    assertBlockRangeEndpoints(next);
    reactPanel.selection.set(next);
    reactPanel.selection.focusBlockSelection(next.focusBlockId);
    return true;
  };

  const enterText = (reactPanel: NavigationPanel): boolean => {
    const blocks = currentNavigationSelection(reactPanel.selection);
    if (!blocks || !isStructuralSelection(blocks) || !hasBlockRanges(blocks)) {
      return false;
    }
    setNavigationCaret(reactPanel, { blockId: blocks.focusBlockId, offset: 0 });
    return true;
  };

  const binding = (id: string, action: (reactPanel: NavigationPanel) => boolean) =>
    reactEditor.keyboard.register(
      {
        id,
        keys: BUILTIN_KEYMAP[id],
      },
      ({ reactPanel }) => action(reactPanel),
    );
  binding(KEYBOARD_BINDING_IDS.blockSelectionUp, (editor) => move(editor, "up", false));
  binding(KEYBOARD_BINDING_IDS.blockSelectionDown, (editor) => move(editor, "down", false));
  binding(KEYBOARD_BINDING_IDS.blockSelectionExtendUp, (editor) => move(editor, "up", true));
  binding(KEYBOARD_BINDING_IDS.blockSelectionExtendDown, (editor) => move(editor, "down", true));
  binding(KEYBOARD_BINDING_IDS.blockSelectionGrowUp, (editor) => grow(editor, "up"));
  binding(KEYBOARD_BINDING_IDS.blockSelectionGrowDown, (editor) => grow(editor, "down"));
  binding(KEYBOARD_BINDING_IDS.blockSelectionCaretLeft, enterText);
  binding(KEYBOARD_BINDING_IDS.blockSelectionCaretRight, enterText);
}
