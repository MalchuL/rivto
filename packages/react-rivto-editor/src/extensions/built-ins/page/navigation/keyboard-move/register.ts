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
import type { KeyboardMovePlacement } from "../utils/types";
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
  reactEditor.keyboard.register(
    {
      id: KEYBOARD_BINDING_IDS.blockMoveUp,
      keys: BUILTIN_KEYMAP[KEYBOARD_BINDING_IDS.blockMoveUp],
    },
    ({ reactPanel, root }) => moveKeyboardBlocks(reactEditor, reactPanel, root, "up"),
  );
  reactEditor.keyboard.register(
    {
      id: KEYBOARD_BINDING_IDS.blockMoveDown,
      keys: BUILTIN_KEYMAP[KEYBOARD_BINDING_IDS.blockMoveDown],
    },
    ({ reactPanel, root }) => moveKeyboardBlocks(reactEditor, reactPanel, root, "down"),
  );
}

/**
 * Moves the active block or selected sibling group through the visible outline.
 *
 * @param reactEditor - Runtime providing registered visibility and move policies.
 * @param reactPanel - Panel containing the active selection.
 * @param root - Surface used to restore structural focus after the move.
 * @param direction - Direction in the visible outline.
 * @returns True when the move was claimed, including a policy rejection.
 */
function moveKeyboardBlocks(
  reactEditor: ReactEditorApi,
  reactPanel: ReactPanelApi,
  root: HTMLElement,
  direction: VerticalDirection,
): boolean {
  // Resolve move groups and destinations from the visible outline, skipping collapsed descendants.
  const isCollapsed = (block: EditorBlock) => !reactEditor.blockBehaviors.childrenVisible(block);
  const selection = currentNavigationSelection(reactPanel.selection);
  const blocks = selection;
  const textLike = blocks && !isStructuralSelection(selection);
  const activeId = selection?.focusBlockId;
  if (!activeId) {
    return false;
  }
  const outline = navigationOutlineBlocks(reactPanel, activeId);
  const roots = selectedMoveRoots(outline, selection, activeId, isCollapsed);
  const placement = keyboardMovePlacement(outline, roots.ids, direction, isCollapsed);
  if (!placement) {
    return false;
  }
  if (!canMoveKeyboardBlocks(reactPanel, roots.ids, placement)) {
    return true;
  }
  reactPanel.blocks.moveBlocks(roots.ids, placement.targetId, placement.position);
  if (roots.grouped && roots.selection) {
    reactPanel.selection.set(roots.selection);
  } else if (blocks) {
    reactPanel.selection.set(blockSelection(outline, activeId, activeId, isCollapsed));
  }
  // Only restore selection and its focus after the move; block mutations remain synchronous.
  reactPanel.selection.scheduleIfSelectionUnchanged(() => {
    if (textLike) {
      reactPanel.selection.restoreDOM(selection);
    } else {
      focusBlockSelection(root, activeId);
    }
  });
  return true;
}

/**
 * Checks the selected roots against the receiving panel's move policies.
 *
 * @param reactPanel - Panel containing the destination and selected roots.
 * @param ids - Selected root IDs to move.
 * @param placement - Target block and relative position.
 * @returns True when all sources exist and registered policies allow the move.
 */
function canMoveKeyboardBlocks(
  reactPanel: ReactPanelApi,
  ids: readonly string[],
  placement: KeyboardMovePlacement,
): boolean {
  const localDestination =
    placement.position === "before"
      ? {
          parentId:
            reactPanel.blocks.getParentId(placement.targetId) ?? reactPanel.rootBlockId ?? null,
          beforeId: placement.targetId,
        }
      : reactPanel.blocks.getInsertionDestinationAfter(placement.targetId);
  const destination =
    "root" in localDestination
      ? { parentId: reactPanel.rootBlockId ?? null, beforeId: localDestination.beforeId }
      : localDestination;
  const sources = ids.flatMap((id) => {
    const block = reactPanel.blocks.getBlockNode(id);
    return block ? [block] : [];
  });
  return (
    sources.length === ids.length &&
    reactPanel.editor.blockBehaviors.canMove({ sources, destination })
  );
}
