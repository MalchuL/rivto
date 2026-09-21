/**
 * Optional equal-width column layout around ordinary document blocks. Nested
 * blocks keep the shared BlockTree shell; this extension only arranges column
 * shells side by side. Removing a column relocates its children instead of
 * deleting them. Drag, clipboard, snapshots, and undo remain owned by core.
 * @module
 */
import { useState, type KeyboardEvent, type MouseEvent } from "react";
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

const COLUMNS_CLASS = "rivto-columns";
const COLUMN_CLASS = "rivto-columns-column";
const SETTINGS_CLASS = "rivto-columns-settings";
const PANEL_CLASS = "rivto-columns-settings-panel";
const COUNT_CLASS = "rivto-columns-count";
const EMPTY_COLUMN_MIN_HEIGHT = "120px";

const COLUMNS_STYLES = `
[data-block-type="${COLUMNS_BLOCK_TYPE}"] {
  min-width: 0;
  max-width: 100%;
}
[data-block-type="${COLUMNS_COLUMN_BLOCK_TYPE}"] {
  min-width: 0;
  max-width: 100%;
  /* Internal lanes are layout shells rather than indented writing blocks. */
  padding-left: 0;
  padding-right: 0;
}
.${COLUMNS_CLASS} {
  display: flex;
  align-items: center;
  gap: 8px;
}
.${COLUMNS_CLASS}:not(:empty) {
  min-height: var(--rivto-default-block-height);
}
.${COLUMNS_CLASS} span { color: #626f86; font-size: 12px; font-variant-numeric: tabular-nums; }
[data-block-type="${COLUMNS_BLOCK_TYPE}"] > .page-block-children {
  display: flex;
  align-items: flex-start;
  gap: 24px;
  width: 100%;
  min-width: 0;
  max-width: 100%;
  margin: 0;
}
[data-block-type="${COLUMNS_BLOCK_TYPE}"] > .page-block-children > .page-block {
  position: relative;
  flex: 1 1 0;
  min-width: 0;
  max-width: 100%;
  overflow: visible;
}
[data-block-type="${COLUMNS_BLOCK_TYPE}"] > .page-block-children > .page-block + .page-block::before {
  content: "";
  position: absolute;
  top: 12px;
  bottom: 12px;
  left: -12px;
  width: 1px;
  background: #dcdfe4;
  pointer-events: none;
}
[data-block-type="${COLUMNS_BLOCK_TYPE}"] > .page-block-children .page-block-row::before {
  /* Cover the handle gutter and block padding without entering another lane. */
  inset: 0 -8px 0 -28px;
  width: auto;
}
[data-block-type="${COLUMNS_COLUMN_BLOCK_TYPE}"] > .page-block-children {
  margin: 0;
  padding: 0 0 0 24px;
  box-sizing: border-box;
}
[data-block-type="${COLUMNS_COLUMN_BLOCK_TYPE}"]:has(> .page-block-children) > .page-block-row {
  display: none;
}
[data-block-type="${COLUMNS_BLOCK_TYPE}"] > .page-block-row .rivto-slot[data-slot-position="right"] {
  left: auto;
  right: 0;
  transform: translateY(-50%);
}
.${COLUMN_CLASS} {
  min-height: ${EMPTY_COLUMN_MIN_HEIGHT};
}
.${SETTINGS_CLASS} { position: relative; display: inline-flex; }
.${SETTINGS_CLASS} > button {
  width: 30px;
  height: 30px;
  border: 1px solid #dcdfe4;
  border-radius: 6px;
  background: white;
  color: #44546f;
  cursor: pointer;
}
.${SETTINGS_CLASS} > button:focus-visible { outline: 2px solid var(--rivto-accent, #6c5ce7); outline-offset: 2px; }
.${PANEL_CLASS} {
  position: absolute;
  top: 36px;
  right: 0;
  z-index: 20;
  width: 220px;
  padding: 16px;
  background: white;
  border: 1px solid #dcdfe4;
  border-radius: 10px;
  box-shadow: 0 8px 24px #091e4226;
}
.${COUNT_CLASS} {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  margin-top: 8px;
}
.${COUNT_CLASS} button {
  width: 28px;
  height: 28px;
  border: 1px solid #dcdfe4;
  border-radius: 6px;
  background: white;
  cursor: pointer;
}
.${COUNT_CLASS} output { font-variant-numeric: tabular-nums; min-width: 1.5ch; text-align: center; }
`;

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
      <span>{count} {count === 1 ? "column" : "columns"}</span>
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
  const [open, setOpen] = useState(false);
  const count = block.childIds.filter((childId) => (
    reactEditor.blocks.getBlockNode(childId)?.type === COLUMNS_COLUMN_BLOCK_TYPE
  )).length;
  return (
    <div className={SETTINGS_CLASS}>
      <button type="button" aria-label="Columns settings" aria-expanded={open} onClick={() => setOpen(!open)}>⚙</button>
      {open && (
        <div className={PANEL_CLASS} role="group" aria-label="Column count">
          <strong>Columns</strong>
          <div className={COUNT_CLASS}>
            <button type="button" aria-label="Remove column" disabled={count <= COLUMNS_MIN_COUNT}
              onClick={() => setColumnsCount(reactEditor, block.id, count - 1)}>-</button>
            <output aria-live="polite">{count}</output>
            <button type="button" aria-label="Add column" disabled={count >= COLUMNS_MAX_COUNT}
              onClick={() => setColumnsCount(reactEditor, block.id, count + 1)}>+</button>
          </div>
        </div>
      )}
    </div>
  );
}

/**
 * Supplies extension-local CSS without changing the shared package stylesheet.
 * @returns One scoped style element owned by the extension lifecycle.
 */
function ColumnsStyles() {
  return <style>{COLUMNS_STYLES}</style>;
}

/**
 * Registers headerless columns presentation and a slash insertion action.
 * @returns Extension whose registrations are removed with the runtime.
 */
export function columnsExtension(): ReactEditorExtension {
  return {
    id: "block.columns",
    setup: (reactEditor) => {
      reactEditor.extensions.mount(ColumnsStyles);
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
