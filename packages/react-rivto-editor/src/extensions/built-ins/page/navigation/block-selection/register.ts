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
import type { ReactPanelApi } from "../../../../../panels/types";
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
  // Arrow navigation and range extension must skip descendants hidden by the shared visibility policy.
  const isCollapsed = (block: EditorBlock) => !reactEditor.blockBehaviors.childrenVisible(block);
  const move = (
    reactPanel: ReactPanelApi,
    root: HTMLElement,
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
    focusBlockSelection(root, next.focusBlockId);
    return true;
  };

  const grow = (
    reactPanel: ReactPanelApi,
    root: HTMLElement,
    direction: VerticalDirection,
  ): boolean => {
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
    focusBlockSelection(root, next.focusBlockId);
    return true;
  };

  const enterText = (reactPanel: ReactPanelApi, root: HTMLElement): boolean => {
    const blocks = currentNavigationSelection(reactPanel.selection);
    if (!blocks || !isStructuralSelection(blocks) || !hasBlockRanges(blocks)) {
      return false;
    }
    setNavigationCaret(root, reactPanel, { blockId: blocks.focusBlockId, offset: 0 });
    return true;
  };

  const binding = (id: string, action: (reactPanel: ReactPanelApi, root: HTMLElement) => boolean) =>
    reactEditor.keyboard.register(
      {
        id,
        keys: BUILTIN_KEYMAP[id],
      },
      ({ reactPanel, root }) => action(reactPanel, root),
    );
  binding(KEYBOARD_BINDING_IDS.blockSelectionUp, (editor, root) => move(editor, root, "up", false));
  binding(KEYBOARD_BINDING_IDS.blockSelectionDown, (editor, root) =>
    move(editor, root, "down", false),
  );
  binding(KEYBOARD_BINDING_IDS.blockSelectionExtendUp, (editor, root) =>
    move(editor, root, "up", true),
  );
  binding(KEYBOARD_BINDING_IDS.blockSelectionExtendDown, (editor, root) =>
    move(editor, root, "down", true),
  );
  binding(KEYBOARD_BINDING_IDS.blockSelectionGrowUp, (editor, root) => grow(editor, root, "up"));
  binding(KEYBOARD_BINDING_IDS.blockSelectionGrowDown, (editor, root) =>
    grow(editor, root, "down"),
  );
  binding(KEYBOARD_BINDING_IDS.blockSelectionCaretLeft, enterText);
  binding(KEYBOARD_BINDING_IDS.blockSelectionCaretRight, enterText);
}
