/**
 * Optional Kanban presentation for ordinary document block subtrees. Boards own
 * column blocks; columns own editable cards with their original IDs and children.
 * Structural moves, snapshots, clipboard and undo remain owned by the core editor.
 * The shared block tree and drag extension render and move every card in both modes.
 * @module
 */
import type { EditorBlockInput } from "@chulane/rivto";
import { createCaretSelection } from "@chulane/rivto";
import { useCallback, useLayoutEffect, useRef, useState, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import { convertLeafToContainer } from "../../../block-behaviors/ops/outline-ops";
import type { BlockWrapperProps } from "../../../blocks";
import { editorControlProps } from "../../../constants";
import { useBlockEditing, useBlockNode, useBlockSelectionAnchor, useEditorView } from "../../../hooks";
import { focusBlock, type ReactEditorExtension } from "../../../managers";
import { KANBAN_BLOCK_TYPE, KANBAN_COLUMN_BLOCK_TYPE, kanbanBehavior, kanbanColumnBehavior } from "./kanban-behavior";

export { KANBAN_BLOCK_TYPE, KANBAN_COLUMN_BLOCK_TYPE } from "./kanban-behavior";

import { PlusIcon } from "lucide-react";
import { BlockModal, BlockModalButton } from "../../../blocks/block-modal/block-modal";
import { Button } from "../../../components/ui/button";

const COLUMN_HEADER_CLASS = "rivto-kanban-column-header flex min-h-8 items-center gap-2 text-(--rivto-kanban-card-foreground)";
const COLUMN_TITLE_CLASS = "rivto-kanban-column-title min-w-0 flex-1 rounded text-sm font-semibold focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-(--rivto-kanban-accent)";
const COLUMN_COUNT_CLASS = "rivto-kanban-column-count text-xs tabular-nums text-(--rivto-kanban-muted-foreground)";
/** Structural sizing and flex order live in kanban.css; the dashed tile look is utility-based. */
const ADD_COLUMN_CLASS = "rivto-kanban-add-column h-auto grid place-items-center rounded-xl border-2 border-dashed border-(--rivto-kanban-card-hover-border)/60 bg-white/45 p-3 text-(--rivto-kanban-muted-foreground) hover:bg-white hover:text-(--rivto-kanban-accent) [&_svg]:size-10";
const ADD_CARD_CLASS = "rivto-kanban-add-card flex";
const BOARD_SUMMARY_CLASS = "rivto-kanban-summary flex items-center gap-2";
const BOARD_SUMMARY_STATS_CLASS = "text-xs tabular-nums text-(--rivto-kanban-muted-foreground)";

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
 * Reads column and nested card counts after hierarchy changes without
 * materializing the board tree or waking for text edits.
 *
 * @param boardId - Persisted kanban identifier.
 * @returns Direct column count and the sum of cards in those columns.
 */
function useKanbanCounts(boardId: string): { readonly columnCount: number; readonly cardCount: number } {
  const editorView = useEditorView();
  const subscribe = useCallback(
    (listener: () => void) => editorView.runtime.blocks.subscribeStructure(listener),
    [editorView],
  );
  const getSnapshot = useCallback(() => {
    const columnIds = editorView.runtime.blocks.getBlockNode(boardId)?.childIds ?? [];
    let cardCount = 0;
    columnIds.forEach((columnId) => {
      cardCount += (editorView.runtime.blocks.getBlockNode(columnId)?.childIds.length ?? 0);
    });
    return `${columnIds.length}:${cardCount}`;
  }, [boardId, editorView]);
  const snapshot = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
  const separator = snapshot.indexOf(":");
  return {
    columnCount: Number(snapshot.slice(0, separator)),
    cardCount: Number(snapshot.slice(separator + 1)),
  };
}

/**
 * Renders the contentless board header; the shared tree renders its columns.
 * The add-column control lives in the lane container and is omitted while collapsed.
 * @param props - Identity of the persisted board.
 * @returns Structural selection region and a compact collapsed summary.
 */
export function Kanban({ blockId }: { readonly blockId: string }) {
  const editorView = useEditorView();
  const editing = useBlockNode(blockId);
  const attributes = useBlockSelectionAnchor(blockId);
  const { columnCount, cardCount } = useKanbanCounts(blockId);
  const block = editing.block;
  const title = useRef<HTMLDivElement>(null);
  const [columns, setColumns] = useState<HTMLElement | null>(null);
  const collapsed = block?.listProps.collapsed === true;
  // The shared tree owns the lane container. A portal adds chrome without
  // persisting a fake column or mounting duplicate blocks and drag targets.
  // Collapse unmounts that container, so the button must not fall back into
  // the title row or it would remain visible on a folded board.
  useLayoutEffect(() => {
    // Synced editors can render the same block ID twice in one document.
    const board = title.current?.closest<HTMLElement>('[data-block-type="kanban"]');
    setColumns(board?.querySelector<HTMLElement>(":scope > .page-block-children") ?? null);
  });
  /**
   * Appends one real column and focuses its editable title in one undo step.
   * @returns Nothing; the shared tree renders the new column.
   */
  const addColumn = () => {
    let columnId = "";
    editorView.runtime.history.batchUpdates(() => {
      editorView.runtime.blocks.updateBlock(blockId, { listProps: { collapsed: false } });
      columnId = editorView.runtime.blocks.insertBlock({ type: KANBAN_COLUMN_BLOCK_TYPE, content: "New column" }).id;
      editorView.runtime.blocks.moveBlocks([columnId], blockId, "inside");
    });
    requestAnimationFrame(() => {
      const root = editorView.events.getRoot();
      if (root) focusBlock(root, columnId, 0);
    });
  };
  const addButton = (
    <Button {...editorControlProps} variant="ghost" className={ADD_COLUMN_CLASS} type="button" aria-label="Add Kanban column" onClick={addColumn}>
      <PlusIcon />
    </Button>
  );
  if (!block) return null;
  return <div ref={title} {...attributes} className={BOARD_SUMMARY_CLASS}>
    {collapsed && <>
      <strong>Kanban</strong>
      <span className={BOARD_SUMMARY_STATS_CLASS}>{columnCount} {columnCount === 1 ? "column" : "columns"} · {cardCount} {cardCount === 1 ? "card" : "cards"}</span>
    </>}
    {columns && !collapsed ? createPortal(addButton, columns) : null}
  </div>;
}

/**
 * Renders an editable column title and advertises its full subtree as a drop area.
 * The add-card control follows the card list, including when that list is empty.
 * @param props - Identity of the persisted column.
 * @returns Editable title with a marker consumed by the shared drag wrapper.
 */
function KanbanColumn({ blockId }: { readonly blockId: string }) {
  const editing = useBlockEditing(blockId);
  const cardCount = editing.block?.childIds.length ?? 0;
  const editorView = useEditorView();
  const header = useRef<HTMLDivElement>(null);
  const addCardButton = useRef<HTMLButtonElement>(null);
  const [addCardHost, setAddCardHost] = useState<HTMLElement | null>(null);
  useLayoutEffect(() => {
    const column = header.current?.closest<HTMLElement>('[data-block-type="kanban-column"]');
    const host = column?.querySelector<HTMLElement>(":scope > .page-block-children") ?? column ?? null;
    setAddCardHost(host);
    // The shared tree may append a new card after this portal; keep the control last.
    if (host && addCardButton.current?.parentElement === host && host.lastElementChild !== addCardButton.current) {
      host.append(addCardButton.current);
    }
  });
  /**
   * Appends an editable card in one undo step and places the caret inside it.
   * @returns Nothing; the shared block tree mounts the new card.
   */
  const addCard = () => {
    let cardId = "";
    editorView.runtime.history.batchUpdates(() => {
      cardId = editorView.runtime.blocks.insertBlock(editorView.runtime.createDefaultBlock()).id;
      editorView.runtime.blocks.moveBlocks([cardId], blockId, "inside");
      editorView.selection.set(createCaretSelection(cardId, 0));
    });
    requestAnimationFrame(() => {
      const root = editorView.events.getRoot();
      if (root) focusBlock(root, cardId, 0);
    });
  };
  return (
    <div ref={header} className={COLUMN_HEADER_CLASS}>
      <div className={COLUMN_TITLE_CLASS} {...editing.attributes} aria-label="Kanban column title" />
      <span className={COLUMN_COUNT_CLASS} aria-label={`${cardCount} cards`}>
        {cardCount}
      </span>
      {addCardHost && editing.block?.listProps.collapsed !== true && createPortal(
        <Button {...editorControlProps} ref={addCardButton} variant="ghost" className={ADD_CARD_CLASS} type="button" aria-label={`Add card to ${editing.block?.content ?? "column"}`} onClick={addCard}>
          <PlusIcon />
        </Button>, addCardHost,
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
    setup: (editorRuntime) => {
      const disposers = [
        editorRuntime.surfaces.registerBlockWrapper("block", KanbanDialog),
        editorRuntime.surfaces.registerBlockWrapper("edgeless", KanbanDialog),
        editorRuntime.surfaces.registerBlockSlot({
          position: "right", component: BlockModalButton, when: ({ block }) => block.type === KANBAN_BLOCK_TYPE,
        }),
        editorRuntime.blockTypes.register({
          definition: {
            type: KANBAN_BLOCK_TYPE,
            title: "Kanban",
            metadata: { containment: { childOutline: "fixed" } },
          },
          render: Kanban,
          behavior: kanbanBehavior,
        }),
        editorRuntime.blockTypes.register({
          definition: {
            type: KANBAN_COLUMN_BLOCK_TYPE,
            title: "Kanban column",
            metadata: { containment: { childOutline: "free", outlineFloor: true } },
          },
          render: KanbanColumn,
          behavior: kanbanColumnBehavior,
        }),
        editorRuntime.slashCommands.register({
          id: "block.kanban.insert",
          title: "Kanban",
          group: "Turn into",
          keywords: ["board", "cards", "tasks"],
          isAvailable: ({ blockId }) => editorRuntime.blocks.hasBlock(blockId) && !editorRuntime.blocks.hasChildren(blockId),
          execute: ({ blockId, editorView }) => {
            convertLeafToContainer(editorView, blockId, createKanbanBlockInput());
          },
        }),
      ];
      return () => disposers.reverse().forEach((dispose) => dispose());
    },
  };
}
