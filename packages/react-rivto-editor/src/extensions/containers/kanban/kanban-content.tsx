import { createCaretSelection } from "@chulane/rivto";
import type { BlockLayoutProps } from "@chulane/rivto-page";
import { PlusIcon } from "lucide-react";
import { useCallback, useSyncExternalStore } from "react";
import { Button } from "../../../components/ui/button";
import { editorControlProps } from "../../../constants";
import {
  useBlockEditing,
  useBlockNode,
  useBlockSelectionAnchor,
  usePanel,
  useReactPanel,
} from "../../../hooks";
import { focusBlock } from "../../../managers";
import { KANBAN_COLUMN_BLOCK_TYPE } from "./kanban-behavior";

/**
 * Reads column and direct-card counts without materializing recursive block trees.
 *
 * The subscription follows structural changes; the scalar snapshot stays stable
 * when unrelated documents or nested card descendants change.
 *
 * @param boardId - Board whose immediate columns supply card counts.
 * @returns Column and direct-card counts encoded as a stable scalar snapshot.
 */
function useKanbanCounts(boardId: string): string {
  const panel = usePanel();
  const subscribe = useCallback(
    (listener: () => void) => panel.blocks.subscribeStructure(listener),
    [panel],
  );
  const read = useCallback(() => {
    const columns = panel.blocks.getBlockNode(boardId)?.childIds ?? [];
    const cards = columns.reduce(
      (count, id) => count + (panel.blocks.getBlockNode(id)?.childIds.length ?? 0),
      0,
    );
    return `${columns.length} ${columns.length === 1 ? "column" : "columns"} · ${cards} ${cards === 1 ? "card" : "cards"}`;
  }, [boardId, panel]);
  return useSyncExternalStore(subscribe, read, read);
}

/**
 * Renders the board's own selection anchor and live structural summary.
 *
 * The header participates in layout in both expanded and collapsed states;
 * it never queries a child host or portals controls into the rendered tree.
 *
 * @param props - Identity of the persisted board.
 * @param props.blockId - Board whose title and direct-column statistics are displayed.
 * @returns A structural header; Page owns the separately composed columns.
 */
export function Kanban({ blockId }: BlockLayoutProps) {
  const attributes = useBlockSelectionAnchor(blockId);
  const counts = useKanbanCounts(blockId);
  return (
    <div {...attributes} className="rivto-kanban-summary">
      <strong>Kanban</strong>
      <span>{counts}</span>
    </div>
  );
}

/**
 * Renders an editable column title and its direct-card count.
 *
 * The column layout owns its card list and footer separately. No DOM ref is
 * shared with them, and no effect appends controls after newly rendered cards.
 *
 * @param props - Identity of the persisted column.
 * @param props.blockId - Column whose content is edited through the ordinary text hook.
 * @returns Editable title and count, without recreating any child block.
 */
export function KanbanColumn({ blockId }: BlockLayoutProps) {
  const editing = useBlockEditing(blockId);
  const count = editing.block?.childIds.length ?? 0;
  return (
    <div className="rivto-kanban-column-header">
      <div
        {...editing.attributes}
        className="rivto-kanban-column-title"
        aria-label="Kanban column title"
      />
      <span className="rivto-kanban-column-count" aria-label={`${count} cards`}>
        {count}
      </span>
    </div>
  );
}

/**
 * Appends a real column and focuses its title after Page mounts it.
 *
 * The board layout places this control after BlockChildren's column sequence.
 * Collapse unmounts it with that sequence. Insertion and expansion share one batch.
 *
 * @param props - Receiving board identity.
 * @param props.blockId - Board to expand and append to when activated.
 * @returns An accessible add-column control owned by the board layout.
 */
export function KanbanAddColumn({ blockId }: BlockLayoutProps) {
  const panel = useReactPanel();
  /**
   * Creates one column in the current document and schedules occurrence-local focus.
   *
   * @returns The column is inserted; focus follows when its DOM is available.
   */
  const add = () => {
    let id = "";
    panel.batchUpdates(() => {
      panel.blocks.updateBlock(blockId, { listProps: { collapsed: false } });
      id = panel.blocks.insertBlock(
        { type: KANBAN_COLUMN_BLOCK_TYPE, content: "New column" },
        { parentId: blockId },
      ).id;
    });
    requestAnimationFrame(() => {
      const root = panel.events.getRoot();
      if (root) {
        focusBlock(root, id, 0);
      }
    });
  };
  return (
    <Button
      {...editorControlProps}
      variant="ghost"
      className="rivto-kanban-add-column"
      type="button"
      aria-label="Add Kanban column"
      onClick={add}
    >
      <PlusIcon />
    </Button>
  );
}

/**
 * Appends a default writing block at the end of its column in one undo batch.
 *
 * This footer is ordinary JSX after the card list, including an empty list.
 * The layout unmounts it on collapse; no portal or imperative reorder is needed.
 *
 * @param props - Receiving column identity.
 * @param props.blockId - Column whose title names the accessible action.
 * @returns An add-card button which stores the caret and focuses the mounted card.
 */
export function KanbanAddCard({ blockId }: BlockLayoutProps) {
  const panel = useReactPanel();
  const { block } = useBlockNode(blockId);
  /**
   * Inserts the configured writing type and places the caret at its beginning.
   *
   * @returns The card and selection are committed together; DOM focus is deferred.
   */
  const add = () => {
    let id = "";
    panel.batchUpdates(() => {
      id = panel.blocks.insertBlock(panel.editor.defaultWritingBlockFactory.createEmptyBlock(), {
        parentId: blockId,
      }).id;
      panel.selection.set(createCaretSelection(id, 0));
    });
    requestAnimationFrame(() => {
      const root = panel.events.getRoot();
      if (root) {
        focusBlock(root, id, 0);
      }
    });
  };
  return (
    <Button
      {...editorControlProps}
      variant="ghost"
      className="rivto-kanban-add-card"
      type="button"
      aria-label={`Add card to ${block?.content || "column"}`}
      onClick={add}
    >
      <PlusIcon />
    </Button>
  );
}
