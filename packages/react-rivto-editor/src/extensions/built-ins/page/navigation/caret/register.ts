import { BlockSelectionEndpoints } from "@chulane/rivto-page";
import type { ReactEditorExtensionApi } from "../../../../../editor/types";
/**
 * Keyboard registration for native-looking horizontal and vertical caret movement.
 *
 * @module
 */
import {
  type EditorMode,
  hasBlockRanges,
  isCaretSelection,
  isStructuralSelection,
} from "@chulane/rivto";
import type { NavigationPanel, NavigationTextPanel } from "../utils/types";
import type { KeyboardTargetState } from "../../../../../managers/keyboard/types";
import { BUILTIN_KEYMAP, KEYBOARD_BINDING_IDS } from "../../../../../managers";
import {
  currentNavigationSelection,
  setNavigationCaret,
  textSelectionEdge,
  type VerticalDirection,
} from "../utils/selection";

/**
 * Identifies form controls that own their arrow keys despite editor selection.
 *
 * @param target - Copied current target properties, when the target is an element.
 * @returns Whether a current-realm form control owns keyboard movement.
 */
function isNativeControl(target: KeyboardTargetState | undefined): boolean {
  return Boolean(target?.isCurrentRealmHTMLElement && target.isFormControl);
}

/**
 * Registers caret movement and vertical text-extension shortcuts.
 *
 * @param reactEditor - Runtime receiving the keyboard bindings.
 * @returns No value.
 */
export function registerCaretNavigation(reactEditor: ReactEditorExtensionApi): void {
  const movePlain = (
    reactPanel: NavigationPanel,
    direction: "left" | "right" | VerticalDirection,
    mode: EditorMode,
  ): boolean => {
    const selection = currentNavigationSelection(reactPanel.selection);
    const item = selection;
    if (!item || !hasBlockRanges(item) || isStructuralSelection(selection)) {
      return false;
    }
    const ends = BlockSelectionEndpoints.resolve(
      item,
      (id) => reactPanel.blocks.getBlockNode(id)?.content.length ?? 0,
    );
    if (!ends) {
      return false;
    }
    let handled = false;
    if (!isCaretSelection(item)) {
      const towardStart = direction === "left" || direction === "up";
      setNavigationCaret(
        reactPanel,
        textSelectionEdge(reactPanel, reactPanel, item, towardStart ? "start" : "end"),
      );
      handled = true;
    } else if (direction === "left" || direction === "right") {
      const block = reactPanel.blocks.getBlockNode(ends.head.blockId);
      let adjacent: typeof ends.head | undefined;
      if (direction === "left" && ends.head.offset === 0) {
        adjacent = reactPanel.selection.adjacentCaretPosition(ends.head.blockId, direction);
      } else if (direction === "right" && ends.head.offset === (block?.content.length ?? -1)) {
        adjacent = reactPanel.selection.adjacentCaretPosition(ends.head.blockId, direction);
      }
      if (adjacent) {
        setNavigationCaret(reactPanel, adjacent);
        handled = true;
      }
    } else {
      const moved = reactPanel.selection.verticalCaretPosition(ends.head, direction);
      if (moved) {
        setNavigationCaret(reactPanel, moved);
        handled = true;
      } else {
        handled = mode === "block" && reactPanel.selection.focusAdjacentEditor(direction);
      }
    }
    return handled;
  };

  const extendText = (reactPanel: NavigationTextPanel, direction: VerticalDirection): boolean => {
    const selection = currentNavigationSelection(reactPanel.selection);
    const item = selection;
    if (!item || !hasBlockRanges(item) || isStructuralSelection(selection)) {
      return false;
    }
    const ends = BlockSelectionEndpoints.resolve(
      item,
      (id) => reactPanel.blocks.getBlockNode(id)?.content.length ?? 0,
    );
    if (!ends) {
      return false;
    }
    const moved = reactPanel.selection.verticalCaretPosition(ends.head, direction);
    if (!moved) {
      return false;
    }
    return reactPanel.selection.selectTextRange(ends.anchor, moved);
  };

  const bindPlain = (id: string, direction: "left" | "right" | VerticalDirection) =>
    reactEditor.keyboard.register(
      {
        id,
        keys: BUILTIN_KEYMAP[id],
      },
      ({ reactPanel, inputRoot, readTarget, mode }) =>
        inputRoot.isAttached() &&
        !isNativeControl(readTarget()) &&
        movePlain(reactPanel, direction, mode),
    );
  bindPlain(KEYBOARD_BINDING_IDS.caretLeft, "left");
  bindPlain(KEYBOARD_BINDING_IDS.caretRight, "right");
  bindPlain(KEYBOARD_BINDING_IDS.caretUp, "up");
  bindPlain(KEYBOARD_BINDING_IDS.caretDown, "down");

  reactEditor.keyboard.register(
    {
      id: KEYBOARD_BINDING_IDS.caretExtendUp,
      keys: BUILTIN_KEYMAP[KEYBOARD_BINDING_IDS.caretExtendUp],
    },
    ({ reactPanel, inputRoot, readTarget }) =>
      inputRoot.isAttached() && !isNativeControl(readTarget()) && extendText(reactPanel, "up"),
  );
  reactEditor.keyboard.register(
    {
      id: KEYBOARD_BINDING_IDS.caretExtendDown,
      keys: BUILTIN_KEYMAP[KEYBOARD_BINDING_IDS.caretExtendDown],
    },
    ({ reactPanel, inputRoot, readTarget }) =>
      inputRoot.isAttached() && !isNativeControl(readTarget()) && extendText(reactPanel, "down"),
  );
}
