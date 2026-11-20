import type { ReactEditorExtensionApi } from "../../../../../editor/types";
/**
 * Keyboard registration for structural movement of blocks and sibling groups.
 *
 * @module
 */
import { isStructuralSelection, type EditorBlock } from "@chulane/rivto";
import type { NavigationPanel } from "../utils/types";
import type { InputRoot } from "@chulane/rivto-root";
import type { PanelInputRegistration } from "../../../../../panels/types";
import { BUILTIN_KEYMAP, KEYBOARD_BINDING_IDS } from "../../../../../managers";
import { blockSelection } from "../utils/block-selection";
import { keyboardMovePlacement } from "../utils/move-placement";
import { selectedMoveRoots } from "../utils/move-roots";
import { navigationOutlineBlocks } from "../utils/scope";
import { currentNavigationSelection, type VerticalDirection } from "../utils/selection";

/**
 * Registers keyboard movement of the active block or sibling selection.
 *
 * @param reactEditor - Runtime receiving the keyboard bindings.
 * @returns No value.
 */
export function registerKeyboardBlockMove(reactEditor: ReactEditorExtensionApi): void {
  // Resolve move groups and destinations from the visible outline, skipping collapsed descendants.
  const isCollapsed = (block: EditorBlock) => !reactEditor.blockBehaviors.childrenVisible(block);
  /**
   * Moves the selected blocks and restores selection while the input remains current.
   *
   * @param reactPanel - Occurrence whose blocks and selection are changed.
   * @param direction - Direction of movement through the visible outline.
   * @param inputRoot - Root that received the initiating keyboard input.
   * @param inputRegistration - Routing lifetime captured by that input.
   * @returns Whether the binding claimed the move.
   * @throws Propagates block, selection, and scheduling failures.
   */
  const move = (
    reactPanel: NavigationPanel,
    direction: VerticalDirection,
    inputRoot: Pick<InputRoot, "isAttached">,
    inputRegistration: PanelInputRegistration,
  ): boolean => {
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
    const destination =
      placement.position === "before"
        ? {
            parentId: reactPanel.document.blocks.getParentId(placement.targetId) ?? null,
            beforeId: placement.targetId,
          }
        : reactPanel.document.blocks.getInsertionDestinationAfter(placement.targetId);
    const sources = roots.ids.flatMap((id) => {
      const block = reactPanel.blocks.getBlockNode(id);
      return block ? [block] : [];
    });
    if (
      sources.length !== roots.ids.length ||
      !reactEditor.blockBehaviors.canMove({ sources, destination })
    ) {
      return true;
    }
    if (!inputRegistration.isCurrent(inputRoot)) {
      return true;
    }
    reactPanel.blocks.moveBlocks(roots.ids, placement.targetId, placement.position);
    if (!inputRegistration.isCurrent(inputRoot)) {
      return true;
    }
    if (roots.grouped && roots.selection) {
      reactPanel.selection.set(roots.selection);
    } else if (blocks) {
      reactPanel.selection.set(blockSelection(outline, activeId, activeId, isCollapsed));
    }
    // Only restore selection and its focus after the move; block mutations remain synchronous.
    if (!inputRegistration.isCurrent(inputRoot)) {
      return true;
    }
    reactPanel.selection.scheduleIfSelectionUnchanged(() => {
      if (!inputRegistration.isCurrent(inputRoot)) {
        return;
      }
      if (textLike) {
        reactPanel.selection.restoreDOM(selection);
      } else {
        reactPanel.selection.focusBlockSelection(activeId);
      }
    });
    return true;
  };

  reactEditor.keyboard.register(
    {
      id: KEYBOARD_BINDING_IDS.blockMoveUp,
      keys: BUILTIN_KEYMAP[KEYBOARD_BINDING_IDS.blockMoveUp],
    },
    ({ reactPanel, inputRoot, inputRegistration }) =>
      move(reactPanel, "up", inputRoot, inputRegistration),
  );
  reactEditor.keyboard.register(
    {
      id: KEYBOARD_BINDING_IDS.blockMoveDown,
      keys: BUILTIN_KEYMAP[KEYBOARD_BINDING_IDS.blockMoveDown],
    },
    ({ reactPanel, inputRoot, inputRegistration }) =>
      move(reactPanel, "down", inputRoot, inputRegistration),
  );
}
