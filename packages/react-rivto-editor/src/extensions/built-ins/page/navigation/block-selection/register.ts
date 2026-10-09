import type { EditorRuntime } from "../../../../../editor-runtime";
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
import type { EditorViewApi } from "../../../../../types";
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
 * @param editorRuntime - Runtime receiving the keyboard bindings.
 * @returns No value.
 */
export function registerBlockSelectionNavigation(editorRuntime: EditorRuntime): void {
  const isCollapsed = (block: EditorBlock) => (
    !editorRuntime.blockListProps.childrenVisible(block)
  );
  const move = (editorView: EditorViewApi, root: HTMLElement, direction: VerticalDirection, extend: boolean): boolean => {
    const selection = currentNavigationSelection(editorView.selection);
    if (!isStructuralSelection(selection)) return false;
    const item = selection;
    if (!item || !hasBlockRanges(item)) return false;
    const outline = navigationOutlineBlocks(editorView, item.focusBlockId);
    const next = extend
      ? extendBlockSelection(outline, item, direction, isCollapsed)
      : adjacentBlockSelection(outline, item, direction, isCollapsed);
    assertBlockRangeEndpoints(next);
    editorView.selection.set(next);
    focusBlockSelection(root, next.focusBlockId);
    return true;
  };

  const grow = (editorView: EditorViewApi, root: HTMLElement, direction: VerticalDirection): boolean => {
    const selection = currentNavigationSelection(editorView.selection);
    const item = selection;
    if (!item || !hasBlockRanges(item)) return false;
    const outline = navigationOutlineBlocks(editorView, item.focusBlockId);
    const next = isStructuralSelection(selection)
      ? extendBlockSelection(outline, item, direction, isCollapsed)
      : blockSelection(outline, item.focusBlockId, item.focusBlockId, isCollapsed);
    if (!next) return false;
    assertBlockRangeEndpoints(next);
    editorView.selection.set(next);
    focusBlockSelection(root, next.focusBlockId);
    return true;
  };

  const enterText = (editorView: EditorViewApi, root: HTMLElement): boolean => {
    const blocks = currentNavigationSelection(editorView.selection);
    if (!blocks || !isStructuralSelection(blocks) || !hasBlockRanges(blocks)) return false;
    setNavigationCaret(root, editorView, { blockId: blocks.focusBlockId, offset: 0 });
    return true;
  };

  const binding = (
    id: string,
    action: (editorView: EditorViewApi, root: HTMLElement) => boolean,
  ) => editorRuntime.keyboard.register({
    id,
    keys: BUILTIN_KEYMAP[id],
  }, ({ editorView, root }) => action(editorView, root));
  binding(KEYBOARD_BINDING_IDS.blockSelectionUp, (editor, root) => move(editor, root, "up", false));
  binding(KEYBOARD_BINDING_IDS.blockSelectionDown, (editor, root) => move(editor, root, "down", false));
  binding(KEYBOARD_BINDING_IDS.blockSelectionExtendUp, (editor, root) => move(editor, root, "up", true));
  binding(KEYBOARD_BINDING_IDS.blockSelectionExtendDown, (editor, root) => move(editor, root, "down", true));
  binding(KEYBOARD_BINDING_IDS.blockSelectionGrowUp, (editor, root) => grow(editor, root, "up"));
  binding(KEYBOARD_BINDING_IDS.blockSelectionGrowDown, (editor, root) => grow(editor, root, "down"));
  binding(KEYBOARD_BINDING_IDS.blockSelectionCaretLeft, enterText);
  binding(KEYBOARD_BINDING_IDS.blockSelectionCaretRight, enterText);
}
