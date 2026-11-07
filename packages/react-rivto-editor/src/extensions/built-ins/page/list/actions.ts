import type { BlockContextMenuRegistration } from "../../../../managers/block-context-menu/types";
import { ListIcon } from "lucide-react";

/**
 * Registers the List style submenu and its ordinary, numbered, and checkbox choices.
 *
 * A choice is checked only when every explicit target has that list type, with
 * an absent type treated as an ordinary list; mixed
 * targets have no checked choice. Executing a choice updates all captured blockIds
 * in one updateBlocks call and resets their checked list property to false.
 *
 * @param menu - Block menu registration capability owned by the extension lifecycle.
 * @returns No value; registration cleanup belongs to the active extension lifecycle.
 * @throws If the registry is inactive or a contribution ID is already registered.
 */
export function registerBlockListActions(menu: BlockContextMenuRegistration): void {
  menu.register({ id: "list", title: "List style", kind: "submenu", order: 20, icon: ListIcon });
  for (const [type, title] of [
    ["list", "Ordinary list"],
    ["numbered_list", "Numbered list"],
    ["checkbox", "Checkboxes"],
  ] as const) {
    menu.register({
      id: `list.${type}`,
      parentId: "list",
      title,
      /**
       * Checks whether every explicit target uses this list choice.
       *
       * @param context - Invoking panel and captured block IDs.
       * @returns True when all targets have this entry's list type, treating an absent type as ordinary.
       */
      isChecked: ({ reactPanel, blockIds }) =>
        blockIds.every((id) => {
          const block = reactPanel.blocks.getBlockNode(id);
          return block !== undefined && (block.listProps.type ?? "list") === type;
        }),
      /**
       * Applies this list choice to all explicit targets in one bulk update.
       *
       * @param context - Invoking panel and captured block IDs.
       * @returns No value after updating type and clearing checked state.
       */
      execute: ({ reactPanel, blockIds }) => {
        reactPanel.blocks.updateBlocks(
          blockIds.map((id) => ({ id, patch: { listProps: { type, checked: false } } })),
        );
      },
    });
  }
}
