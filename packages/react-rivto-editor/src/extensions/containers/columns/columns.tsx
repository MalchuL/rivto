/**
 * Optional equal-width column layout around ordinary document blocks. Nested
 * blocks keep the shared BlockTree shell; this extension only arranges column
 * shells side by side. Removing a column relocates its children instead of
 * deleting them. Drag, clipboard, snapshots, and undo remain owned by core.
 * @module
 */
import { type KeyboardEvent, type MouseEvent } from "react";
import { MinusIcon, PlusIcon, SettingsIcon } from "lucide-react";
import { Button } from "../../../components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "../../../components/ui/popover";
import { type EditorBlockInput } from "@chulane/rivto";
import { useBlockEditing, useBlockNode, useReactEditor } from "../../../hooks";
import {
  type BlockSlotProps,
  type ReactEditorExtension,
} from "../../../managers";
import type { ReactEditor } from "../../../types";
import { createBlockViewContext } from "../../../views/context";
import {
  COLUMNS_BLOCK_TYPE,
  COLUMNS_COLUMN_BLOCK_TYPE,
  columnsColumnView,
  columnsView,
  relocateColumnContents,
} from "./columns-view";
import { convertLeafToContainer } from "../../../views/ops/outline-ops";

export {
  COLUMNS_BLOCK_TYPE,
  COLUMNS_COLUMN_BLOCK_TYPE,
  relocateColumnContents,
} from "./columns-view";
export const COLUMNS_DEFAULT_COUNT = 2;
export const COLUMNS_MIN_COUNT = 1;
export const COLUMNS_MAX_COUNT = 6;

const COLUMNS_CLASS = "rivto-columns flex items-center gap-2";
const COLUMNS_STATS_CLASS = "text-xs tabular-nums text-muted-foreground";
const COLUMN_CLASS = "rivto-columns-column min-h-[120px]";
const SETTINGS_CLASS = "rivto-columns-settings relative inline-flex";
const PANEL_CLASS = "rivto-columns-settings-panel w-56 p-4";
const COUNT_CLASS = "rivto-columns-count mt-2 flex items-center justify-between gap-2";
const COUNT_VALUE_CLASS = "min-w-[1.5ch] text-center tabular-nums";

/**
 * Rejects counts that would create an empty or overflowing column board.
 * @param value - Requested column count.
 * @returns The accepted integer in the supported range.
 */
function columnCount(value: number): number {
  if (!Number.isInteger(value) || value < COLUMNS_MIN_COUNT || value > COLUMNS_MAX_COUNT) {
    throw new Error(`Columns count must be an integer from ${COLUMNS_MIN_COUNT} to ${COLUMNS_MAX_COUNT}`);
  }
  return value;
}

/**
 * Creates one column shell, optionally seeded with a writing block.
 *
 * @param writingBlock - Nested default writing block; omitted for an empty lane.
 * @returns Portable column input.
 */
function createColumnInput(writingBlock?: EditorBlockInput): EditorBlockInput {
  return {
    type: COLUMNS_COLUMN_BLOCK_TYPE,
    content: "",
    children: writingBlock ? [structuredClone(writingBlock)] : [],
  };
}

/**
 * Creates a headerless column board with equally sized columns.
 *
 * @param count - Initial column count; defaults to two.
 * @param writingBlock - Seeded writing block cloned into every lane.
 * @returns Portable board subtree inserted through the ordinary block manager.
 */
export function createColumnsBlockInput(
  count = COLUMNS_DEFAULT_COUNT,
  writingBlock?: EditorBlockInput,
): EditorBlockInput {
  return {
    type: COLUMNS_BLOCK_TYPE,
    content: "",
    children: Array.from({ length: columnCount(count) }, () => createColumnInput(writingBlock)),
  };
}

/**
 * Changes how many column shells a board owns, relocating nested blocks first.
 * @param reactEditor - Active React editor runtime.
 * @param blockId - Columns board identifier.
 * @param count - Desired column count in the supported range.
 * @returns Whether the board existed and the count could be applied.
 */
export function setColumnsCount(reactEditor: ReactEditor, blockId: string, count: number): boolean {
  const board = reactEditor.blocks.getBlock(blockId);
  if (board?.type !== COLUMNS_BLOCK_TYPE || !Number.isFinite(count)) return false;
  const next = Math.max(COLUMNS_MIN_COUNT, Math.min(COLUMNS_MAX_COUNT, Math.round(count)));
  const columns = board.children.filter((child) => child.type === COLUMNS_COLUMN_BLOCK_TYPE);
  if (next === columns.length) return true;
  reactEditor.history.batchUpdates(() => {
    reactEditor.blocks.updateBlock(board.id, { listProps: { collapsed: false } });
    if (next > columns.length) {
      let afterId = columns.at(-1)?.id ?? board.id;
      for (let index = columns.length; index < next; index += 1) {
        const insertedId = reactEditor.blocks.insertBlock({
          type: COLUMNS_COLUMN_BLOCK_TYPE,
          content: "",
        }, afterId === board.id ? undefined : afterId).id;
        if (afterId === board.id) {
          reactEditor.blocks.moveBlocks([insertedId], board.id, "inside");
        }
        afterId = insertedId;
      }
      return;
    }
    const removed = columns.slice(next);
    relocateColumnContents(reactEditor, removed.map((column) => column.id));
    reactEditor.blocks.removeBlocks(removed.map((column) => column.id));
  });
  return true;
}

/**
 * Occupies the board content slot and summarizes hidden columns when collapsed.
 * @param props - Identity of the persisted board; content is intentionally empty.
 * @returns Structural selection region and a compact collapsed summary.
 */
export function Columns({ blockId }: { readonly blockId: string }) {
  const editing = useBlockEditing(blockId, { textEdit: false });
  const block = editing.block;
  if (!block) return null;
  const count = block.childIds.length;
  return <div {...editing.attributes} className={COLUMNS_CLASS}>
    {block.listProps.collapsed === true && <>
      <strong>Columns</strong>
      <span className={COLUMNS_STATS_CLASS}>{count} {count === 1 ? "column" : "columns"}</span>
    </>}
  </div>;
}

/**
 * Marks an empty column as a click-to-start writing target.
 * @param props - Identity of the persisted column.
 * @returns Empty-lane control; drop and sort markers live on the column shell.
 */
function ColumnsColumn({ blockId }: { readonly blockId: string }) {
  const reactEditor = useReactEditor();
  const { block } = useBlockNode(blockId);
  const empty = block?.childIds.length === 0;
  /**
   * Creates the first writing block when the column has no nested content.
   * @param event - Click or keyboard activation of the empty column.
   * @returns Nothing; insertion is a single undo step.
   */
  const startWriting = (event: MouseEvent<HTMLDivElement> | KeyboardEvent<HTMLDivElement>) => {
    if (!empty || event.defaultPrevented) return;
    if ("key" in event && event.key !== "Enter" && event.key !== " ") return;
    event.preventDefault();
    event.stopPropagation();
    const root = reactEditor.events.getRoot();
    const context = root ? createBlockViewContext(reactEditor, blockId, root) : undefined;
    if (context) columnsColumnView.insertFirstChild(context);
  };
  return (
    <div
      className={COLUMN_CLASS}
      tabIndex={empty ? 0 : -1}
      role={empty ? "button" : undefined}
      aria-label="Column"
      onClick={startWriting}
      onKeyDown={startWriting}
    />
  );
}

/**
 * Provides the right-side control that changes how many columns the board owns.
 * @param props - Live board snapshot.
 * @returns Settings button and count panel.
 */
function ColumnsControls({ block }: BlockSlotProps) {
  const reactEditor = useReactEditor();
  const count = block.childIds.filter((childId) => (
    reactEditor.blocks.getBlockNode(childId)?.type === COLUMNS_COLUMN_BLOCK_TYPE
  )).length;
  return (
    <div className={SETTINGS_CLASS}>
      <Popover>
        <PopoverTrigger asChild>
          <Button variant="outline" size="icon-sm" type="button" aria-label="Columns settings">
            <SettingsIcon />
          </Button>
        </PopoverTrigger>
        <PopoverContent align="end" className={PANEL_CLASS} role="group" aria-label="Column count">
          <strong>Columns</strong>
          <div className={COUNT_CLASS}>
            <Button variant="outline" size="icon-sm" type="button" aria-label="Remove column" disabled={count <= COLUMNS_MIN_COUNT}
              onClick={() => setColumnsCount(reactEditor, block.id, count - 1)}><MinusIcon /></Button>
            <output className={COUNT_VALUE_CLASS} aria-live="polite">{count}</output>
            <Button variant="outline" size="icon-sm" type="button" aria-label="Add column" disabled={count >= COLUMNS_MAX_COUNT}
              onClick={() => setColumnsCount(reactEditor, block.id, count + 1)}><PlusIcon /></Button>
          </div>
        </PopoverContent>
      </Popover>
    </div>
  );
}

/**
 * Registers headerless columns presentation and a slash insertion action.
 * @returns Extension whose registrations are removed with the runtime.
 */
export function columnsExtension(): ReactEditorExtension {
  return {
    id: "block.columns",
    setup: (reactEditor) => {
      reactEditor.blockTypes.register({
        definition: {
          type: COLUMNS_BLOCK_TYPE,
          title: "Columns",
          metadata: { containment: { childOutline: "fixed" } },
        },
        render: Columns,
        view: columnsView,
      });
      reactEditor.blockTypes.register({
        definition: {
          type: COLUMNS_COLUMN_BLOCK_TYPE,
          title: "Column",
          metadata: { containment: { childOutline: "free", outlineFloor: true } },
        },
        render: ColumnsColumn,
        view: columnsColumnView,
      });
      reactEditor.surfaces.registerBlockSlot({
        position: "right",
        component: ColumnsControls,
        when: ({ block }) => block.type === COLUMNS_BLOCK_TYPE,
      });
      reactEditor.slashCommands.register({
        id: "block.columns.insert",
        title: "Columns",
        group: "Turn into",
        keywords: ["layout", "split", "grid"],
        isAvailable: ({ blockId }) => reactEditor.blocks.hasBlock(blockId) && !reactEditor.blocks.hasChildren(blockId),
        execute: ({ blockId }) => {
          convertLeafToContainer(reactEditor, blockId, createColumnsBlockInput());
        },
      });
    },
  };
}
