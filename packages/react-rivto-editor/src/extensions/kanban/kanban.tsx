/**
 * Optional Kanban presentation for ordinary document block subtrees. Boards own
 * column blocks; columns own editable cards with their original IDs and children.
 * Structural moves, snapshots, clipboard and undo remain owned by the core editor.
 * The shared block tree and drag extension render and move every card in both modes.
 * @module
 */
import { useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { BlockWrapperProps } from "../../blocks";
import type { EditorBlockInput } from "@chulane/rivto";
import { createCaretSelection } from "@chulane/rivto";
import { MarkdownContent } from "../../blocks/markdown";
import { useBlock, useBlockEditing, useReactEditor } from "../../hooks";
import { focusBlock, type ReactEditorExtension } from "../../managers";

import { BlockModal, BlockModalButton } from "../../blocks/block-modal";

const COLUMN_HEADER_CLASS = "rivto-kanban-column-header";
const COLUMN_TITLE_CLASS = "rivto-kanban-column-title";
const COLUMN_COUNT_CLASS = "rivto-kanban-column-count";
const ADD_COLUMN_CLASS = "rivto-kanban-add-column";
const ADD_CARD_CLASS = "rivto-kanban-add-card";

export const KANBAN_BLOCK_TYPE = "kanban";
export const KANBAN_COLUMN_BLOCK_TYPE = "kanban-column";

/**
 * Creates a board with three empty columns, ready to receive existing blocks.
 * @returns Portable block input inserted through the ordinary block manager.
 */
export function createKanbanBlockInput(): EditorBlockInput {
  return {
    type: KANBAN_BLOCK_TYPE,
    content: "Kanban",
    children: ["To do", "In progress", "Done"].map((content) => ({
      type: KANBAN_COLUMN_BLOCK_TYPE,
      content,
    })),
  };
}

/**
 * Renders the editable board title; the shared tree renders its column children.
 * The add-column control lives in the lane container and is omitted while collapsed.
 * @param props - Identity of the persisted board.
 * @returns Collaborative title component.
 */
export function Kanban({ blockId }: { readonly blockId: string }) {
  const runtime = useReactEditor();
  const { block } = useBlock(blockId);
  const title = useRef<HTMLDivElement>(null);
  const [columns, setColumns] = useState<HTMLElement | null>(null);
  const collapsed = block?.listProps.collapsed === true;
  // The shared tree owns the lane container. A portal adds chrome without
  // persisting a fake column or mounting duplicate blocks and drag targets.
  // Collapse unmounts that container, so the button must not fall back into
  // the title row or it would remain visible on a folded board.
  useLayoutEffect(() => {
    setColumns(title.current?.ownerDocument.getElementById(`block-children-${blockId}`) ?? null);
  });
  /**
   * Appends one real column and focuses its editable title in one undo step.
   * @returns Nothing; the shared tree renders the new column.
   */
  const addColumn = () => {
    let columnId = "";
    runtime.editor.batchUpdates(() => {
      runtime.blocks.updateBlock(blockId, { listProps: { collapsed: false } });
      columnId = runtime.blocks.insertBlock({ type: KANBAN_COLUMN_BLOCK_TYPE, content: "New column" }, blockId);
      runtime.editor.blocks.moveBlocks([columnId], blockId, "inside");
    });
    requestAnimationFrame(() => {
      const root = runtime.events.getRoot();
      if (root) focusBlock(root, columnId, 0);
    });
  };
  const addButton = <button className={ADD_COLUMN_CLASS} type="button" aria-label="Add Kanban column" onClick={addColumn}>+</button>;
  return <div ref={title} data-block-sort-children="horizontal">
    <MarkdownContent blockId={blockId} />
    {columns && !collapsed ? createPortal(addButton, columns) : null}
  </div>;
}

/**
 * Renders an editable column title and advertises its full subtree as a drop area.
 * The add-card control is omitted while the column is collapsed.
 * @param props - Identity of the persisted column.
 * @returns Editable title with a marker consumed by the shared drag wrapper.
 */
function KanbanColumn({ blockId }: { readonly blockId: string }) {
  const editing = useBlockEditing(blockId);
  const runtime = useReactEditor();
  /**
   * Appends an editable card in one undo step and places the caret inside it.
   * @returns Nothing; the shared block tree mounts the new card.
   */
  const addCard = () => {
    let cardId = "";
    runtime.editor.batchUpdates(() => {
      cardId = runtime.blocks.insertBlock(runtime.createDefaultBlock(), blockId);
      runtime.editor.blocks.moveBlocks([cardId], blockId, "inside");
      runtime.selection.set(createCaretSelection(cardId, 0));
    });
    requestAnimationFrame(() => {
      const root = runtime.events.getRoot();
      if (root) focusBlock(root, cardId, 0);
    });
  };
  return (
    <div className={COLUMN_HEADER_CLASS} data-block-drop-container="" data-block-sort-children="vertical">
      <div className={COLUMN_TITLE_CLASS} {...editing.attributes} aria-label="Kanban column title" />
      <span className={COLUMN_COUNT_CLASS} aria-label={`${editing.block?.children.length ?? 0} cards`}>
        {editing.block?.children.length ?? 0}
      </span>
      {editing.block?.listProps.collapsed !== true && (
        // Collapse hides cards; keep the header compact without a dangling add control.
        <button className={ADD_CARD_CLASS} type="button" aria-label={`Add card to ${editing.block?.content ?? "column"}`} onClick={addCard}>
          +
        </button>
      )}
    </div>
  );
}

/**
 * Wraps boards with the shared expandable container.
 * @param props - Current block and its mounted subtree.
 * @returns Expandable board or the unchanged subtree.
 */
function KanbanDialog({ block, children }: BlockWrapperProps) {
  return block.type === KANBAN_BLOCK_TYPE ? <BlockModal label="Kanban">{children}</BlockModal> : children;
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
          position: "right", component: BlockModalButton, when: ({ block }) => block.type === KANBAN_BLOCK_TYPE,
        }),
        reactEditor.blocks.register({
          definition: { type: KANBAN_BLOCK_TYPE, title: "Kanban" },
          render: Kanban,
        }),
        reactEditor.blocks.register({
          definition: { type: KANBAN_COLUMN_BLOCK_TYPE, title: "Kanban column" },
          render: KanbanColumn,
        }),
        reactEditor.slashCommands.register({
          id: "block.kanban.insert",
          title: "Kanban",
          group: "Insert",
          keywords: ["board", "cards", "tasks"],
          execute: ({ blockId }) => {
            reactEditor.blocks.insertBlock(createKanbanBlockInput(), blockId);
          },
        }),
      ];
      return () => disposers.reverse().forEach((dispose) => dispose());
    },
  };
}
