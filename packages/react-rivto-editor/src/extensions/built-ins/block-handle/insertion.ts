import { createCaretSelection } from "@chulane/rivto";
import { focusBlock } from "../../../managers";
import type { BlockContextMenuEntry } from "../../../managers/block-context-menu/types";

/** Menu registration borrowed from the editor extension lifecycle. */
interface InsertionMenu {
  /**
   * Registers an action until its extension is removed.
   *
   * @param entry - Action contributed to the menu.
   * @returns A disposer that removes the registration.
   * @throws If the registration is invalid or duplicates an existing entry.
   */
  register(entry: BlockContextMenuEntry): () => void;
}

/**
 * Registers insertion of an empty writing block beside the clicked block.
 *
 * Protected panel roots cannot have siblings inserted through their panel.
 * The inserted block becomes the caret selection and receives focus after rendering.
 *
 * @param menu - Registry that owns the insertion action registrations.
 * @returns No value; the extension lifecycle owns the registrations.
 * @throws If a registration is rejected by the registry.
 */
export function registerBlockInsertionActions(menu: InsertionMenu): void {
  for (const [position, title, order] of [
    ["above", "Insert block above", 11],
    ["below", "Insert block below", 12],
  ] as const) {
    menu.register({
      id: `block.insert-${position}`,
      title,
      order,
      /**
       * Checks whether the clicked block permits a sibling in this panel.
       *
       * @param context - Invoking panel and clicked block.
       * @returns Whether the panel exposes the clicked block's sibling list.
       */
      isAvailable: ({ reactPanel, blockId }) => reactPanel.blocks.canRemove(blockId),
      /**
       * Inserts the writing block at the requested sibling position.
       *
       * @param context - Invoking panel and clicked block.
       * @returns No value after inserting and scheduling caret focus.
       * @throws If the panel rejects the insertion or selection update.
       */
      execute: ({ reactPanel, blockId }) => {
        const parentId = reactPanel.blocks.getParentId(blockId);
        if (parentId === undefined) {
          return;
        }
        let destination = reactPanel.blocks.getInsertionDestinationAfter(blockId);
        if (position === "above") {
          destination =
            parentId === null ? { root: true, beforeId: blockId } : { parentId, beforeId: blockId };
        }
        const block = reactPanel.blocks.insertBlock(
          reactPanel.editor.defaultWritingBlockFactory.createEmptyBlock(),
          destination,
        );
        reactPanel.selection.set(createCaretSelection(block.id, 0));
        const root = reactPanel.getRoot();
        if (root) {
          reactPanel.selection.scheduleIfSelectionUnchanged(() => focusBlock(root, block.id, 0));
        }
      },
    });
  }
}
