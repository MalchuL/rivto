import type { ReactEditorApi } from "../../../../../editor/types";
/**
 * Keyboard registration for native-looking horizontal and vertical caret movement.
 *
 * @module
 */
import {
  createTextSelection,
  type EditorMode,
  hasBlockRanges,
  isCaretSelection,
  isStructuralSelection,
} from "@chulane/rivto";
import type { ReactPanelApi } from "../../../../../panels/types";
import { BUILTIN_KEYMAP, findNextEditableBlock, findPreviousEditableBlock, KEYBOARD_BINDING_IDS, resolveSelectionEndpoints, verticalCaretPosition } from "../../../../../managers";
import { pageEntries } from "../utils/outline";
import { navigationDomRoot, navigationOutlineBlocks } from "../utils/scope";
import {
  currentNavigationSelection,
  focusAdjacentEditor,
  setNavigationCaret,
  textSelectionEdge,
  type VerticalDirection,
} from "../utils/selection";

/** Native controls own arrow keys even when the editor retains a text selection. */
function isNativeControl(target: EventTarget | null): boolean {
  return target instanceof HTMLElement && /^(INPUT|TEXTAREA|SELECT|BUTTON)$/.test(target.tagName);
}

/**
 * Registers caret movement and vertical text-extension shortcuts.
 *
 * @param reactEditor - Runtime receiving the keyboard bindings.
 * @returns No value.
 */
export function registerCaretNavigation(reactEditor: ReactEditorApi): void {
  const movePlain = (reactPanel: ReactPanelApi, root: HTMLElement, direction: "left" | "right" | VerticalDirection, mode: EditorMode): boolean => {
    const selection = currentNavigationSelection(reactPanel.selection);
    const item = selection;
    if (!item || !hasBlockRanges(item) || isStructuralSelection(selection)) return false;
    const ends = resolveSelectionEndpoints(item, id => reactPanel.blocks.getBlockNode(id)?.content.length ?? 0);
    if (!ends) return false;
    const scope = navigationDomRoot(root, ends.head.blockId);
    let handled = false;
    if (!isCaretSelection(item)) {
      const towardStart = direction === "left" || direction === "up";
      setNavigationCaret(root, reactPanel, textSelectionEdge(
        reactPanel,
        reactPanel,
        item,
        towardStart ? "start" : "end",
      ));
      handled = true;
    } else if (direction === "left" || direction === "right") {
      const block = reactPanel.blocks.getBlockNode(ends.head.blockId);
      const adjacent = direction === "left" && ends.head.offset === 0
        ? findPreviousEditableBlock(scope, ends.head.blockId)
        : direction === "right" && ends.head.offset === (block?.content.length ?? -1)
          ? findNextEditableBlock(scope, ends.head.blockId)
          : null;
      if (adjacent) {
        setNavigationCaret(root, reactPanel, {
          blockId: adjacent.blockId,
          offset: direction === "left" ? adjacent.content.textContent?.length ?? 0 : 0,
        });
        handled = true;
      }
    } else {
      const moved = verticalCaretPosition(scope, ends.head, direction);
      if (moved) {
        setNavigationCaret(root, reactPanel, moved);
        handled = true;
      } else {
        handled = mode === "block" && focusAdjacentEditor(root, direction);
      }
    }
    return handled;
  };

  const extendText = (reactPanel: ReactPanelApi, root: HTMLElement, direction: VerticalDirection): boolean => {
    const selection = currentNavigationSelection(reactPanel.selection);
    const item = selection;
    if (!item || !hasBlockRanges(item) || isStructuralSelection(selection)) return false;
    const ends = resolveSelectionEndpoints(item, id => reactPanel.blocks.getBlockNode(id)?.content.length ?? 0);
    if (!ends) return false;
    const scope = navigationDomRoot(root, ends.head.blockId);
    const moved = verticalCaretPosition(scope, ends.head, direction);
    if (!moved) return false;
    const outline = pageEntries(navigationOutlineBlocks(reactPanel, ends.head.blockId)).map(({ block }) => ({
      id: block.id,
      length: block.content.length,
    }));
    const next = createTextSelection(outline, ends.anchor, moved);
    if (!next) return false;
    reactPanel.selection.set(next);
    reactPanel.selection.restoreDOM();
    return true;
  };

  const bindPlain = (
    id: string,
    direction: "left" | "right" | VerticalDirection,
  ) => reactEditor.keyboard.register({
    id,
    keys: BUILTIN_KEYMAP[id],
  }, ({ reactPanel, root, raw, mode }) => !isNativeControl(raw.target) && movePlain(reactPanel, root, direction, mode));
  bindPlain(KEYBOARD_BINDING_IDS.caretLeft, "left");
  bindPlain(KEYBOARD_BINDING_IDS.caretRight, "right");
  bindPlain(KEYBOARD_BINDING_IDS.caretUp, "up");
  bindPlain(KEYBOARD_BINDING_IDS.caretDown, "down");

  reactEditor.keyboard.register({
    id: KEYBOARD_BINDING_IDS.caretExtendUp,
    keys: BUILTIN_KEYMAP[KEYBOARD_BINDING_IDS.caretExtendUp],
  }, ({ reactPanel, root, raw }) => !isNativeControl(raw.target) && extendText(reactPanel, root, "up"));
  reactEditor.keyboard.register({
    id: KEYBOARD_BINDING_IDS.caretExtendDown,
    keys: BUILTIN_KEYMAP[KEYBOARD_BINDING_IDS.caretExtendDown],
  }, ({ reactPanel, root, raw }) => !isNativeControl(raw.target) && extendText(reactPanel, root, "down"));
}
