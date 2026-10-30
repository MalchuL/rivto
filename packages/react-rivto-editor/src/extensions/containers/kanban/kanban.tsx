import { BLOCK_TEXT_METADATA_KEY } from "../../../managers/selection/block-text-metadata";
import { KanbanLayout, KanbanColumnLayout } from "./kanban-layout";
/**
 * Optional Kanban presentation for ordinary document block subtrees. Boards own
 * column blocks; columns own editable cards with their original IDs and children.
 * Structural moves, snapshots, clipboard and undo remain owned by the core editor.
 * The shared block tree and drag extension render and move every card in both modes.
 * @module
 */
import type { EditorBlockInput } from "@chulane/rivto";
import { convertLeafToContainer } from "../convert-leaf-to-container";
import type { BlockWrapperProps } from "../../../blocks";
import type { ReactEditorExtension } from "../../../managers";
import { Kanban, KanbanColumn } from "./kanban-content";
export { Kanban } from "./kanban-content";
import {
  KANBAN_BLOCK_TYPE,
  KANBAN_COLUMN_BLOCK_TYPE,
  kanbanBehavior,
  kanbanColumnBehavior,
} from "./kanban-behavior";

export { KANBAN_BLOCK_TYPE, KANBAN_COLUMN_BLOCK_TYPE } from "./kanban-behavior";

import { BlockModal, BlockModalButton } from "../../../blocks/block-modal/block-modal";

/**
 * Creates a board with three empty columns, ready to receive existing blocks.
 * @returns Portable block input inserted through the ordinary block manager.
 */
export function createKanbanBlockInput(): EditorBlockInput {
  return {
    type: KANBAN_BLOCK_TYPE,
    content: "",
    children: ["To do", "In progress", "Done"].map((content) => ({
      type: KANBAN_COLUMN_BLOCK_TYPE,
      content,
    })),
  };
}

/**
 * Wraps boards with the shared expandable container.
 * @param props - Current block and its mounted subtree.
 * @returns Expandable board or the unchanged subtree.
 */
function KanbanDialog({ block, children }: BlockWrapperProps) {
  return block.type === KANBAN_BLOCK_TYPE ? (
    <BlockModal blockId={block.id} label="Kanban">
      {children}
    </BlockModal>
  ) : (
    children
  );
}

/**
 * Registers Kanban block renderers and a slash action without altering the preset.
 * @returns Extension whose registrations are removed with the runtime.
 */
export function kanbanExtension(): ReactEditorExtension {
  return {
    id: "block.kanban",
    setup: (reactEditor) => {
      const disposers = [
        reactEditor.surfaces.registerBlockWrapper("block", KanbanDialog),
        reactEditor.surfaces.registerBlockWrapper("edgeless", KanbanDialog),
        reactEditor.surfaces.registerBlockSlot({
          position: "right",
          component: BlockModalButton,
          when: ({ block }) => block.type === KANBAN_BLOCK_TYPE,
        }),
        reactEditor.blockTypes.register({
          definition: {
            type: KANBAN_BLOCK_TYPE,
            title: "Kanban",
          },
          render: Kanban,
          layout: KanbanLayout,
          behavior: kanbanBehavior,
        }),
        reactEditor.blockTypes.register({
          definition: {
            type: KANBAN_COLUMN_BLOCK_TYPE,
            title: "Kanban column",
            metadata: {
              [BLOCK_TEXT_METADATA_KEY]: true,
            },
          },
          render: KanbanColumn,
          layout: KanbanColumnLayout,
          behavior: kanbanColumnBehavior,
        }),
        reactEditor.slashCommands.register({
          id: "block.kanban.insert",
          title: "Kanban",
          group: "Turn into",
          keywords: ["board", "cards", "tasks"],
          isAvailable: ({ blockId, reactPanel }) =>
            reactPanel.blocks.hasBlock(blockId) && !reactPanel.blocks.hasChildren(blockId),
          execute: ({ blockId, reactPanel }) => {
            convertLeafToContainer(reactPanel, blockId, createKanbanBlockInput());
          },
        }),
      ];
      return () => disposers.reverse().forEach((dispose) => dispose());
    },
  };
}
