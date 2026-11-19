import { createCaretSelection } from "@chulane/rivto";
import { ArrowUpToLineIcon, ArrowDownToLineIcon } from "lucide-react";
import type { BlockFactory } from "../../../block-factories";
import type { ReactPanelApi } from "../../../panels/types";
import { focusBlock } from "../../../managers";
import type { BlockContextMenuRegistration } from "./types";

/**
 * Resolves a new sibling and checks its proposed placement against the panel and block behaviors.
 *
 * An accessible anchor can still have a parent that restricts child types, such as a table
 * row. Menu availability and execution both check the live destination in case the anchor moves.
 *
 * @param panel - Panel whose root bounds the sibling list.
 * @param anchor - Clicked block which must allow sibling insertion.
 * @param factory - Supplies the new block's initial fields.
 * @param position - Requested side of the anchor.
 * @returns Creation input and destination, or undefined for a protected or disallowed placement.
 */
export function siblingInsertion(
  panel: Pick<ReactPanelApi, "blocks">,
  anchor: string,
  factory: BlockFactory,
  position: "above" | "below",
) {
  // A sibling of a protected embed root would fall outside the panel.
  if (!panel.blocks.canRemove(anchor)) {
    return;
  }
  const parentId = panel.blocks.getParentId(anchor);
  if (parentId === undefined) {
    return;
  }
  const destination =
    position === "above"
      ? { parentId, beforeId: anchor }
      : panel.blocks.getInsertionDestinationAfter(anchor);
  const input = factory.createEmptyBlock();
  const block = {
    ...input,
    id: input.id ?? crypto.randomUUID(),
    content: input.content ?? "",
    listProps: input.listProps ?? {},
    props: input.props ?? {},
    pluginData: input.pluginData ?? {},
  };
  if (panel.blocks.canMove({ sources: [block], destination })) {
    return { block, destination };
  }
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
export function registerBlockInsertionActions(menu: BlockContextMenuRegistration): void {
  for (const [position, title, order, icon] of [
    ["above", "Insert block above", 11, ArrowUpToLineIcon],
    ["below", "Insert block below", 12, ArrowDownToLineIcon],
  ] as const) {
    menu.register({
      id: `block.insert-${position}`,
      title,
      icon,
      order,
      /**
       * Checks whether the clicked block permits a sibling in this panel.
       *
       * @param context - Invoking panel and clicked block.
       * @returns Whether the panel exposes the clicked block's sibling list.
       */
      isAvailable: ({ reactPanel, blockId }) =>
        !!siblingInsertion(
          reactPanel,
          blockId,
          reactPanel.editor.defaultWritingBlockFactory,
          position,
        ),
      /**
       * Inserts the writing block at the requested sibling position.
       *
       * @param context - Invoking panel and clicked block.
       * @returns No value after inserting and scheduling caret focus.
       * @throws If the panel rejects the insertion or selection update.
       */
      execute: ({ reactPanel, blockId }) => {
        const insertion = siblingInsertion(
          reactPanel,
          blockId,
          reactPanel.editor.defaultWritingBlockFactory,
          position,
        );
        if (!insertion) {
          return;
        }
        const block = reactPanel.blocks.insertBlock(insertion.block, insertion.destination);
        reactPanel.selection.set(createCaretSelection(block.id, 0));
        const root = reactPanel.getRoot();
        if (root) {
          reactPanel.selection.scheduleIfSelectionUnchanged(() => focusBlock(root, block.id, 0));
        }
      },
    });
  }
}
